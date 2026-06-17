export type CollaborationPresence = {
  peerId: string;
  displayName: string;
  color: string;
  roomId: string;
  playheadBeat: number;
  selectedTrackId: string | null;
  selectedBlockId: string | null;
  updatedAt: number;
};

export type CollaborationRoomState = {
  roomId: string;
  selfPeerId: string;
  peers: Record<string, CollaborationPresence>;
};

export type CollaborationPresenceInput = {
  peerId: string;
  displayName: string;
  color: string;
  roomId: string;
  playheadBeat: number;
  selectedTrackId: string | null;
  selectedBlockId: string | null;
  now: number;
};

const DEFAULT_ROOM_ID = 'local-studio';
const DEFAULT_PEER_NAME = 'Producer';
const PEER_COLORS = ['#8ee3f5', '#f6c85f', '#f08a8a', '#9be282'];

export function sanitizeCollaborationRoomId(value: string): string {
  const clean = value.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '');
  return clean || DEFAULT_ROOM_ID;
}

export function sanitizePeerName(value: string): string {
  const clean = value.trim().replace(/\s+/g, ' ');
  return clean || DEFAULT_PEER_NAME;
}

export function peerColor(peerId: string): string {
  const hash = Array.from(peerId).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return PEER_COLORS[hash % PEER_COLORS.length];
}

export function createPresence(input: CollaborationPresenceInput): CollaborationPresence {
  return {
    peerId: input.peerId,
    displayName: sanitizePeerName(input.displayName),
    color: input.color,
    roomId: sanitizeCollaborationRoomId(input.roomId),
    playheadBeat: Number.isFinite(input.playheadBeat) ? Math.max(0, input.playheadBeat) : 0,
    selectedTrackId: input.selectedTrackId,
    selectedBlockId: input.selectedBlockId,
    updatedAt: input.now,
  };
}

export function emptyCollaborationRoom(
  roomId: string,
  selfPeerId: string,
): CollaborationRoomState {
  return {
    roomId: sanitizeCollaborationRoomId(roomId),
    selfPeerId,
    peers: {},
  };
}

export function upsertPeerPresence(
  state: CollaborationRoomState,
  presence: CollaborationPresence,
): CollaborationRoomState {
  if (presence.peerId === state.selfPeerId || presence.roomId !== state.roomId) {
    return state;
  }
  const current = state.peers[presence.peerId];
  if (current && current.updatedAt > presence.updatedAt) {
    return state;
  }
  return {
    ...state,
    peers: {...state.peers, [presence.peerId]: presence},
  };
}

export function pruneStalePeers(
  state: CollaborationRoomState,
  now: number,
  ttlMs = 15_000,
): CollaborationRoomState {
  const peers = Object.fromEntries(
    Object.entries(state.peers).filter(([, peer]) => now - peer.updatedAt <= ttlMs),
  );
  return {...state, peers};
}

export function collaborationPeerList(
  state: CollaborationRoomState,
): CollaborationPresence[] {
  return Object.values(state.peers).sort((left, right) =>
    left.displayName.localeCompare(right.displayName),
  );
}
