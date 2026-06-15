import http from 'node:http';
import {createCollaborationServicePersistence} from './collaboration-service-persistence.mjs';
import {
  createCollaborationServicePolicy,
  originAllowed,
  publicPolicy,
  securityHeaders,
  tokenAllowed,
} from './collaboration-service-policy.mjs';
import {acceptKey, readFrames, textFrame, writeHttpResponse} from './collaboration-service-websocket.mjs';

function sanitizeRoomId(value) {
  const clean = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-|-$/g, '');
  return clean || 'local-studio';
}

function peerKey(roomId, peerId) {
  return `${roomId}:${peerId}`;
}

function operationOrder(left, right) {
  return left.clock - right.clock
    || left.createdAt - right.createdAt
    || String(left.peerId).localeCompare(String(right.peerId))
    || left.clientSeq - right.clientSeq
    || String(left.id).localeCompare(String(right.id));
}

function resolveOperations(operations) {
  const ordered = [...operations].sort(operationOrder);
  const byId = new Map();
  const latestByConflictKey = new Map();
  ordered.forEach(operation => {
    if (!byId.has(operation.id)) {
      byId.set(operation.id, operation);
    }
    if (operation.conflictKey) {
      latestByConflictKey.set(operation.conflictKey, operation);
    }
  });
  return [...byId.values()]
    .sort(operationOrder)
    .filter(operation =>
      !operation.conflictKey || latestByConflictKey.get(operation.conflictKey)?.id === operation.id,
    );
}

function messageAllowed(message, roomId, peerId) {
  if (message?.type === 'presence') {
    return message.presence?.roomId === roomId && message.presence?.peerId === peerId;
  }
  if (message?.type === 'operation') {
    return message.operation?.roomId === roomId && message.operation?.peerId === peerId;
  }
  if (message?.type === 'signal') {
    return message.signal?.roomId === roomId &&
      message.signal?.fromPeerId === peerId &&
      typeof message.signal?.toPeerId === 'string' &&
      message.signal.toPeerId.trim().length > 0;
  }
  return false;
}

function startServer() {
  const port = Number.parseInt(process.env.COLLAB_PORT ?? '4731', 10);
  const host = process.env.COLLAB_HOST ?? '127.0.0.1';
  const policy = createCollaborationServicePolicy(process.env);
  if (policy.errors.length > 0) {
    policy.errors.forEach(error => console.error(`Collaboration service policy error: ${error}`));
    process.exitCode = 1;
    return;
  }
  const statePath = process.env.AI_PRODUCER_COLLAB_STATE_PATH ?? process.env.COLLAB_STATE_PATH ?? '';
  const rooms = new Map();

  const server = http.createServer((request, response) => {
    if (request.url === '/health') {
      const roomStats = [...rooms.entries()].map(([roomId, room]) => ({
        roomId,
        peers: room.sockets.size,
        knownPeers: room.presences.size,
        operations: room.operations.length,
      }));
      response.writeHead(200, securityHeaders(policy));
      response.end(JSON.stringify({
        ok: true,
        tokenRequired: policy.tokenRequired,
        rooms: roomStats,
        deployment: publicPolicy(policy),
        persistence: persistence.status(),
      }));
      return;
    }
    response.writeHead(404, securityHeaders(policy));
    response.end();
  });

  const createRoom = () => ({sockets: new Map(), operations: [], presences: new Map()});

  const roomFor = roomId => {
    const room = rooms.get(roomId);
    if (room) {
      return room;
    }
    const created = createRoom();
    rooms.set(roomId, created);
    return created;
  };

  const persistence = createCollaborationServicePersistence({
    statePath,
    rooms,
    roomFor,
    sanitizeRoomId,
    resolveOperations,
  });

  const broadcast = (roomId, sender, message) => {
    const room = rooms.get(roomId);
    if (!room) {
      return;
    }
    const frame = textFrame(message);
    room.sockets.forEach((socket, keyForSocket) => {
      if (keyForSocket !== sender && !socket.destroyed) {
        socket.write(frame);
      }
    });
  };

  const receiveText = (roomId, peerId, sender, text) => {
    let message;
    try {
      message = JSON.parse(text);
    } catch {
      return;
    }
    if (!messageAllowed(message, roomId, peerId)) {
      return;
    }
    const room = roomFor(roomId);
    if (message.type === 'presence') {
      room.presences.set(peerId, message.presence);
      persistence.save();
    }
    if (message.type === 'signal') {
      const target = room.sockets.get(peerKey(roomId, message.signal.toPeerId));
      if (target && !target.destroyed) {
        target.write(textFrame(text));
      }
      return;
    }
    if (message.type === 'operation') {
      const nextOperations = resolveOperations([...room.operations, message.operation]);
      if (!nextOperations.some(operation => operation.id === message.operation.id)) {
        return;
      }
      room.operations = nextOperations.slice(-policy.maxOperationsPerRoom);
      persistence.save();
    }
    broadcast(roomId, sender, text);
  };

  const roomStateFrame = roomId => {
    const room = roomFor(roomId);
    return textFrame(JSON.stringify({
      type: 'room_state',
      snapshot: {
        roomId,
        peerIds: [...room.sockets.keys()].map(key => key.slice(roomId.length + 1)).sort(),
        presences: [...room.presences.values()],
        operations: room.operations,
      },
    }));
  };

  server.on('upgrade', (request, socket) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
    const roomId = sanitizeRoomId(url.searchParams.get('room'));
    const peerId = String(url.searchParams.get('peer') ?? '').trim();
    const token = String(url.searchParams.get('token') ?? '').trim();
    const key = request.headers['sec-websocket-key'];
    const keyForPeer = peerKey(roomId, peerId);
    const room = rooms.get(roomId);
    if (!originAllowed(request.headers.origin, policy)) {
      writeHttpResponse(socket, 403, 'Forbidden');
      return;
    }
    if (!peerId || typeof key !== 'string' || !tokenAllowed(token, policy)) {
      writeHttpResponse(socket, 401, 'Unauthorized');
      return;
    }
    if (!room && rooms.size >= policy.maxRooms) {
      writeHttpResponse(socket, 429, 'Too Many Requests');
      return;
    }
    if (room && !room.sockets.has(keyForPeer) && room.sockets.size >= policy.maxPeersPerRoom) {
      writeHttpResponse(socket, 429, 'Too Many Requests');
      return;
    }

    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey(key)}`,
      '\r\n',
    ].join('\r\n'));

    const activeRoom = roomFor(roomId);
    activeRoom.sockets.set(keyForPeer, socket);
    socket.write(roomStateFrame(roomId));
    let pending = Buffer.alloc(0);
    let windowStartedAt = Date.now();
    let messageCount = 0;

    socket.setTimeout(policy.idleTimeoutMs, () => socket.destroy());

    socket.on('data', chunk => {
      try {
        if (pending.length + chunk.length > policy.maxMessageBytes + 16) {
          socket.destroy();
          return;
        }
        const result = readFrames(Buffer.concat([pending, chunk]), {maxPayloadBytes: policy.maxMessageBytes});
        pending = result.rest;
        for (const message of result.messages) {
          if (message.type === 'close') {
            socket.end();
          }
          if (message.type === 'text') {
            const now = Date.now();
            if (now - windowStartedAt >= 60000) {
              windowStartedAt = now;
              messageCount = 0;
            }
            messageCount += 1;
            if (messageCount > policy.maxMessagesPerMinute) {
              socket.destroy();
              return;
            }
            receiveText(roomId, peerId, keyForPeer, message.text);
          }
        }
      } catch {
        socket.destroy();
      }
    });

    socket.on('close', () => {
      activeRoom.sockets.delete(keyForPeer);
      if (activeRoom.sockets.size === 0 && activeRoom.operations.length === 0 && activeRoom.presences.size === 0) {
        rooms.delete(roomId);
      }
      persistence.save();
    });
  });

  server.on('error', error => {
    console.error(`Collaboration service failed to start: ${error.message}`);
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`Collaboration service listening on ws://${host}:${port}`);
  });
}

startServer();
