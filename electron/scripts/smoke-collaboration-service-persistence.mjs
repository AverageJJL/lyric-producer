import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createCollaborationServicePersistence} from './collaboration-service-persistence.mjs';

function sanitizeRoomId(value) {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'local-studio';
}

function roomStore() {
  const rooms = new Map();
  const roomFor = roomId => {
    const existing = rooms.get(roomId);
    if (existing) {
      return existing;
    }
    const created = {sockets: new Map(), operations: [], presences: new Map()};
    rooms.set(roomId, created);
    return created;
  };
  return {rooms, roomFor};
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-collab-state-'));
const statePath = path.join(tempRoot, 'rooms.json');

try {
  const first = roomStore();
  const firstPersistence = createCollaborationServicePersistence({
    statePath,
    rooms: first.rooms,
    roomFor: first.roomFor,
    sanitizeRoomId,
    resolveOperations: operations => operations,
  });
  const room = first.roomFor('dark-room');
  const presence = {
    peerId: 'peer-1',
    displayName: 'Producer',
    color: '#8ee3f5',
    roomId: 'dark-room',
    playheadBeat: 4,
    selectedTrackId: null,
    selectedBlockId: null,
    updatedAt: 1000,
  };
  const operation = {
    id: 'op-1',
    roomId: 'dark-room',
    peerId: 'peer-1',
    clientSeq: 1,
    clock: 1,
    createdAt: 1000,
    targetType: 'track',
    targetId: 'track-1',
    action: 'rename',
    conflictKey: 'track:track-1:name',
    payload: {name: 'Lead'},
  };
  room.presences.set('peer-1', presence);
  room.operations = [operation];
  firstPersistence.save();

  const stored = JSON.parse(readFileSync(statePath, 'utf8'));
  assert.equal(stored.version, 1);
  assert.equal(stored.rooms[0].roomId, 'dark-room');

  const restored = roomStore();
  const restoredPersistence = createCollaborationServicePersistence({
    statePath,
    rooms: restored.rooms,
    roomFor: restored.roomFor,
    sanitizeRoomId,
    resolveOperations: operations => operations,
  });
  assert.equal(restoredPersistence.status().loadedRoomCount, 1);
  assert.deepEqual(restored.roomFor('dark-room').presences.get('peer-1'), presence);
  assert.deepEqual(restored.roomFor('dark-room').operations, [operation]);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
