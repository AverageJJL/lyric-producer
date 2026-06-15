import {existsSync, mkdirSync, readFileSync, renameSync, writeFileSync} from 'node:fs';
import path from 'node:path';

function isRecord(value) {
  return typeof value === 'object' && value !== null;
}

function arrayOfRecords(value) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function snapshotRooms(rooms) {
  return [...rooms.entries()]
    .map(([roomId, room]) => ({
      roomId,
      presences: [...room.presences.values()],
      operations: room.operations,
    }))
    .filter(snapshot => snapshot.presences.length > 0 || snapshot.operations.length > 0);
}

function normalizeSnapshot(rawSnapshot, sanitizeRoomId) {
  if (!isRecord(rawSnapshot) || typeof rawSnapshot.roomId !== 'string') {
    return null;
  }
  const roomId = sanitizeRoomId(rawSnapshot.roomId);
  const presences = arrayOfRecords(rawSnapshot.presences).filter(presence =>
    typeof presence.peerId === 'string' &&
    sanitizeRoomId(presence.roomId) === roomId,
  );
  const operations = arrayOfRecords(rawSnapshot.operations).filter(operation =>
    typeof operation.id === 'string' &&
    typeof operation.peerId === 'string' &&
    sanitizeRoomId(operation.roomId) === roomId,
  );
  return {roomId, presences, operations};
}

function readSnapshots(statePath, sanitizeRoomId) {
  if (!statePath || !existsSync(statePath)) {
    return [];
  }
  const parsed = JSON.parse(readFileSync(statePath, 'utf8'));
  const rawSnapshots = Array.isArray(parsed) ? parsed : parsed.rooms;
  return arrayOfRecords(rawSnapshots)
    .map(snapshot => normalizeSnapshot(snapshot, sanitizeRoomId))
    .filter(Boolean);
}

function writeSnapshots(statePath, rooms) {
  const payload = {
    version: 1,
    rooms: snapshotRooms(rooms),
  };
  mkdirSync(path.dirname(statePath), {recursive: true});
  const tempPath = `${statePath}.${process.pid}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`);
  renameSync(tempPath, statePath);
}

export function createCollaborationServicePersistence({
  statePath,
  rooms,
  roomFor,
  sanitizeRoomId,
  resolveOperations,
}) {
  const cleanStatePath = String(statePath ?? '').trim();
  let loadedRoomCount = 0;
  let lastError = '';

  if (cleanStatePath) {
    try {
      for (const snapshot of readSnapshots(cleanStatePath, sanitizeRoomId)) {
        const room = roomFor(snapshot.roomId);
        snapshot.presences.forEach(presence => room.presences.set(presence.peerId, presence));
        room.operations = resolveOperations([...room.operations, ...snapshot.operations]);
        loadedRoomCount += 1;
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`Collaboration service state load failed: ${lastError}`);
    }
  }

  const save = () => {
    if (!cleanStatePath) {
      return;
    }
    try {
      writeSnapshots(cleanStatePath, rooms);
      lastError = '';
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error(`Collaboration service state save failed: ${lastError}`);
    }
  };

  return {
    save,
    status() {
      return {
        enabled: Boolean(cleanStatePath),
        loadedRoomCount,
        path: cleanStatePath,
        lastError,
      };
    },
  };
}
