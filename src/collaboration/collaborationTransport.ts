import type {CollaborationPresence} from './collaborationRoom';
import {sanitizeCollaborationRoomId} from './collaborationRoom';

export type CollaborationTransportMode = 'local' | 'remote';
export type CollaborationTransportStatus = 'idle' | 'connecting' | 'connected' | 'error';
export type CollaborationOperationTarget = 'project' | 'track' | 'clip' | 'section' | 'mix';

export type CollaborationOperation = {
  id: string;
  roomId: string;
  peerId: string;
  clientSeq: number;
  clock: number;
  createdAt: number;
  targetType: CollaborationOperationTarget;
  targetId: string;
  action: string;
  conflictKey: string | null;
  payload: Record<string, unknown>;
};

export type CollaborationSignalKind = 'offer' | 'answer' | 'ice';

export type CollaborationSignal = {
  id: string;
  roomId: string;
  fromPeerId: string;
  toPeerId: string;
  kind: CollaborationSignalKind;
  payload: Record<string, unknown>;
  createdAt: number;
};

export type CollaborationRoomWireSnapshot = {
  roomId: string;
  peerIds: string[];
  presences: CollaborationPresence[];
  operations: CollaborationOperation[];
};

export type CollaborationWireMessage =
  | {type: 'presence'; presence: CollaborationPresence}
  | {type: 'operation'; operation: CollaborationOperation}
  | {type: 'signal'; signal: CollaborationSignal}
  | {type: 'room_state'; snapshot: CollaborationRoomWireSnapshot};

type CollaborationOperationInput = Omit<CollaborationOperation, 'id' | 'roomId' | 'createdAt'> & {
  roomId: string;
  now: number;
  id?: string;
};

type ConflictResolution = {
  accepted: CollaborationOperation[];
  superseded: CollaborationOperation[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function sanitizeRemoteEndpoint(value: string): string {
  const clean = value.trim();
  if (!clean) {
    return '';
  }
  try {
    const url = new URL(clean);
    return url.protocol === 'ws:' || url.protocol === 'wss:' ? url.toString() : '';
  } catch {
    return '';
  }
}

export function collaborationServiceUrl(
  endpoint: string,
  roomId: string,
  peerId: string,
  token = '',
): string {
  const safeEndpoint = sanitizeRemoteEndpoint(endpoint);
  if (!safeEndpoint || !peerId.trim()) {
    return '';
  }
  const url = new URL(safeEndpoint);
  url.searchParams.set('room', sanitizeCollaborationRoomId(roomId));
  url.searchParams.set('peer', peerId);
  if (token.trim()) {
    url.searchParams.set('token', token.trim());
  }
  return url.toString();
}

export function createCollaborationOperation(
  input: CollaborationOperationInput,
): CollaborationOperation {
  const roomId = sanitizeCollaborationRoomId(input.roomId);
  const createdAt = Number.isFinite(input.now) ? Math.max(0, input.now) : 0;
  const clientSeq = Math.max(0, Math.floor(input.clientSeq));
  const clock = Math.max(0, Math.floor(input.clock));
  return {
    ...input,
    id: input.id ?? `${input.peerId}:${clientSeq}:${clock}:${createdAt}`,
    roomId,
    clientSeq,
    clock,
    createdAt,
    action: input.action.trim(),
    conflictKey: input.conflictKey?.trim() || null,
    payload: {...input.payload},
  };
}

export function createCollaborationSignal(
  input: Omit<CollaborationSignal, 'id' | 'roomId' | 'createdAt'> & {
    roomId: string;
    now: number;
    id?: string;
  },
): CollaborationSignal {
  const roomId = sanitizeCollaborationRoomId(input.roomId);
  const createdAt = Number.isFinite(input.now) ? Math.max(0, input.now) : 0;
  return {
    ...input,
    id: input.id ?? `${roomId}:${input.fromPeerId}:${input.toPeerId}:${input.kind}:${createdAt}`,
    roomId,
    createdAt,
    payload: {...input.payload},
  };
}

export function orderCollaborationOperations(
  operations: CollaborationOperation[],
): CollaborationOperation[] {
  return [...operations].sort((left, right) =>
    left.clock - right.clock
    || left.createdAt - right.createdAt
    || left.peerId.localeCompare(right.peerId)
    || left.clientSeq - right.clientSeq
    || left.id.localeCompare(right.id),
  );
}

export function resolveCollaborationConflicts(
  operations: CollaborationOperation[],
): ConflictResolution {
  const ordered = orderCollaborationOperations(operations);
  const byId = new Map<string, CollaborationOperation>();
  const latestByConflictKey = new Map<string, CollaborationOperation>();

  ordered.forEach(operation => {
    if (!byId.has(operation.id)) {
      byId.set(operation.id, operation);
    }
    if (operation.conflictKey) {
      latestByConflictKey.set(operation.conflictKey, operation);
    }
  });

  const unique = orderCollaborationOperations([...byId.values()]);
  const accepted = unique.filter(operation =>
    !operation.conflictKey || latestByConflictKey.get(operation.conflictKey)?.id === operation.id,
  );
  const superseded = unique.filter(operation =>
    operation.conflictKey && latestByConflictKey.get(operation.conflictKey)?.id !== operation.id,
  );

  return {accepted, superseded};
}

export function serializeCollaborationWireMessage(message: CollaborationWireMessage): string {
  return JSON.stringify(message);
}

export function parseCollaborationWireMessage(value: unknown): CollaborationWireMessage | null {
  let raw: unknown;
  try {
    raw = typeof value === 'string' ? JSON.parse(value) as unknown : value;
  } catch {
    return null;
  }
  if (!isRecord(raw) || !['presence', 'operation', 'signal', 'room_state'].includes(String(raw.type))) {
    return null;
  }
  if (raw.type === 'presence' && isPresence(raw.presence)) {
    return {type: 'presence', presence: raw.presence};
  }
  if (raw.type === 'operation' && isOperation(raw.operation)) {
    return {type: 'operation', operation: raw.operation};
  }
  if (raw.type === 'signal' && isSignal(raw.signal)) {
    return {type: 'signal', signal: raw.signal};
  }
  if (raw.type === 'room_state' && isRoomSnapshot(raw.snapshot)) {
    return {type: 'room_state', snapshot: raw.snapshot};
  }
  return null;
}

function isPresence(value: unknown): value is CollaborationPresence {
  return isRecord(value)
    && isString(value.peerId)
    && isString(value.displayName)
    && isString(value.color)
    && isString(value.roomId)
    && isFiniteNumber(value.playheadBeat)
    && isFiniteNumber(value.updatedAt);
}

function isOperation(value: unknown): value is CollaborationOperation {
  return isRecord(value)
    && isString(value.id)
    && isString(value.roomId)
    && isString(value.peerId)
    && isFiniteNumber(value.clientSeq)
    && isFiniteNumber(value.clock)
    && isFiniteNumber(value.createdAt)
    && isString(value.targetType)
    && isString(value.targetId)
    && isString(value.action)
    && (value.conflictKey === null || typeof value.conflictKey === 'string')
    && isRecord(value.payload);
}

function isSignal(value: unknown): value is CollaborationSignal {
  return isRecord(value)
    && isString(value.id)
    && isString(value.roomId)
    && isString(value.fromPeerId)
    && isString(value.toPeerId)
    && (value.kind === 'offer' || value.kind === 'answer' || value.kind === 'ice')
    && isRecord(value.payload)
    && isFiniteNumber(value.createdAt);
}

function isRoomSnapshot(value: unknown): value is CollaborationRoomWireSnapshot {
  return isRecord(value)
    && isString(value.roomId)
    && Array.isArray(value.peerIds)
    && value.peerIds.every(isString)
    && Array.isArray(value.presences)
    && value.presences.every(isPresence)
    && Array.isArray(value.operations)
    && value.operations.every(isOperation);
}
