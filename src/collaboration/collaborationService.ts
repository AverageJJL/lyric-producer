import {sanitizeCollaborationRoomId, type CollaborationPresence} from './collaborationRoom';
import {
  parseCollaborationWireMessage,
  resolveCollaborationConflicts,
  serializeCollaborationWireMessage,
  type CollaborationOperation,
  type CollaborationWireMessage,
} from './collaborationTransport';

export type CollaborationServiceClientInput = {
  roomId: string;
  peerId: string;
  token?: string;
  send: (message: string) => void;
};

export type CollaborationServiceRegisterResult =
  | {ok: true; clientId: string; roomId: string; peerId: string}
  | {ok: false; reason: string};

export type CollaborationServiceRoomSnapshot = {
  roomId: string;
  peerIds: string[];
  knownPeerIds: string[];
  presences: CollaborationPresence[];
  operations: CollaborationOperation[];
};

export type CollaborationServicePolicy = {
  allowedTokens?: string[];
  maxPeersPerRoom?: number;
  initialSnapshots?: CollaborationServiceRoomSnapshot[];
  onSnapshot?: (snapshots: CollaborationServiceRoomSnapshot[]) => void;
};

type CollaborationServiceClient = {
  id: string;
  roomId: string;
  peerId: string;
  send: (message: string) => void;
};

type CollaborationServiceRoom = {
  clients: Map<string, CollaborationServiceClient>;
  presences: Map<string, CollaborationPresence>;
  operations: CollaborationOperation[];
};

export type CollaborationService = ReturnType<typeof createCollaborationService>;

function clientId(roomId: string, peerId: string): string {
  return `${roomId}:${peerId}`;
}

function tokenAllowed(token: string | undefined, allowedTokens: string[] | undefined): boolean {
  if (!allowedTokens || allowedTokens.length === 0) {
    return true;
  }
  return Boolean(token && allowedTokens.includes(token));
}

export function createCollaborationService(policy: CollaborationServicePolicy = {}) {
  const rooms = new Map<string, CollaborationServiceRoom>();
  const maxPeersPerRoom = Math.max(1, policy.maxPeersPerRoom ?? 32);

  const roomFor = (roomId: string): CollaborationServiceRoom => {
    const existing = rooms.get(roomId);
    if (existing) {
      return existing;
    }
    const created = {
      clients: new Map<string, CollaborationServiceClient>(),
      presences: new Map<string, CollaborationPresence>(),
      operations: [],
    };
    rooms.set(roomId, created);
    return created;
  };

  const hydrateSnapshot = (snapshot: CollaborationServiceRoomSnapshot) => {
    const roomId = sanitizeCollaborationRoomId(snapshot.roomId);
    const room = roomFor(roomId);
    room.presences.clear();
    snapshot.presences
      .filter(presence => sanitizeCollaborationRoomId(presence.roomId) === roomId)
      .forEach(presence => room.presences.set(presence.peerId, presence));
    room.operations = resolveCollaborationConflicts(snapshot.operations.filter(operation =>
      sanitizeCollaborationRoomId(operation.roomId) === roomId,
    )).accepted;
  };

  const broadcast = (
    roomId: string,
    message: CollaborationWireMessage,
    exceptClientId: string,
  ) => {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }
    const wire = serializeCollaborationWireMessage(message);
    room.clients.forEach(client => {
      if (client.id !== exceptClientId) {
        client.send(wire);
      }
    });
  };

  const removeRoomIfEmpty = (roomId: string) => {
    const room = rooms.get(roomId);
    if (room && room.clients.size === 0 && room.operations.length === 0 && room.presences.size === 0) {
      rooms.delete(roomId);
    }
  };

  const snapshotFor = (roomId: string): CollaborationServiceRoomSnapshot => {
    const room = rooms.get(sanitizeCollaborationRoomId(roomId));
    const peerIds = room ? [...room.clients.values()].map(client => client.peerId).sort() : [];
    const presences = room ? [...room.presences.values()] : [];
    return {
      roomId: sanitizeCollaborationRoomId(roomId),
      peerIds,
      knownPeerIds: [...new Set([...peerIds, ...presences.map(presence => presence.peerId)])].sort(),
      presences,
      operations: room ? [...room.operations] : [],
    };
  };

  const sendRoomState = (client: CollaborationServiceClient) => {
    client.send(serializeCollaborationWireMessage({
      type: 'room_state',
      snapshot: snapshotFor(client.roomId),
    }));
  };

  const roomSnapshots = (): CollaborationServiceRoomSnapshot[] =>
    [...rooms.keys()].sort().map(snapshotFor);

  const notifySnapshotChange = () => {
    policy.onSnapshot?.(roomSnapshots());
  };

  policy.initialSnapshots?.forEach(hydrateSnapshot);

  return {
    registerClient(input: CollaborationServiceClientInput): CollaborationServiceRegisterResult {
      const roomId = sanitizeCollaborationRoomId(input.roomId);
      const peerId = input.peerId.trim();
      if (!peerId) {
        return {ok: false, reason: 'Missing peer id.'};
      }
      if (!tokenAllowed(input.token, policy.allowedTokens)) {
        return {ok: false, reason: 'Collaboration token rejected.'};
      }

      const room = roomFor(roomId);
      const id = clientId(roomId, peerId);
      if (!room.clients.has(id) && room.clients.size >= maxPeersPerRoom) {
        return {ok: false, reason: 'Collaboration room is full.'};
      }
      const client = {id, roomId, peerId, send: input.send};
      room.clients.set(id, client);
      sendRoomState(client);
      notifySnapshotChange();
      return {ok: true, clientId: id, roomId, peerId};
    },

    removeClient(clientIdToRemove: string): void {
      rooms.forEach((room, roomId) => {
        room.clients.delete(clientIdToRemove);
        removeRoomIfEmpty(roomId);
      });
      notifySnapshotChange();
    },

    receiveFromClient(clientIdFromSender: string, rawMessage: unknown): boolean {
      const client = [...rooms.values()]
        .flatMap(room => [...room.clients.values()])
        .find(candidate => candidate.id === clientIdFromSender);
      if (!client) {
        return false;
      }
      const message = parseCollaborationWireMessage(rawMessage);
      if (!message || !messageAllowedForClient(message, client)) {
        return false;
      }

      if (message.type === 'presence') {
        roomFor(client.roomId).presences.set(client.peerId, message.presence);
        broadcast(client.roomId, message, client.id);
        notifySnapshotChange();
        return true;
      }

      if (message.type === 'signal') {
        const targetId = clientId(client.roomId, message.signal.toPeerId);
        const target = roomFor(client.roomId).clients.get(targetId);
        if (!target) {
          return false;
        }
        target.send(serializeCollaborationWireMessage(message));
        return true;
      }

      const room = roomFor(client.roomId);
      const resolved = resolveCollaborationConflicts([...room.operations, message.operation]);
      const acceptedIds = new Set(resolved.accepted.map(operation => operation.id));
      room.operations = resolved.accepted;
      if (!acceptedIds.has(message.operation.id)) {
        return false;
      }
      broadcast(client.roomId, message, client.id);
      notifySnapshotChange();
      return true;
    },

    roomSnapshot(roomIdInput: string): CollaborationServiceRoomSnapshot {
      return snapshotFor(roomIdInput);
    },

    roomSnapshots,
  };
}

function messageAllowedForClient(
  message: CollaborationWireMessage,
  client: CollaborationServiceClient,
): boolean {
  if (message.type === 'presence') {
    return message.presence.roomId === client.roomId
      && message.presence.peerId === client.peerId;
  }
  if (message.type === 'signal') {
    return message.signal.roomId === client.roomId
      && message.signal.fromPeerId === client.peerId
      && message.signal.toPeerId.trim().length > 0;
  }
  return message.operation.roomId === client.roomId
    && message.operation.peerId === client.peerId;
}
