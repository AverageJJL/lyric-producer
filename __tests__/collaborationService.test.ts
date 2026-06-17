import {createPresence} from '../src/collaboration/collaborationRoom';
import {
  createCollaborationService,
  type CollaborationServiceRoomSnapshot,
} from '../src/collaboration/collaborationService';
import {
  createCollaborationOperation,
  createCollaborationSignal,
  parseCollaborationWireMessage,
  serializeCollaborationWireMessage,
} from '../src/collaboration/collaborationTransport';

function sentMessages(): {send: (message: string) => void; messages: string[]} {
  const messages: string[] = [];
  return {
    messages,
    send: message => messages.push(message),
  };
}

describe('collaboration service room policy', () => {
  it('requires configured tokens and enforces room capacity', () => {
    const service = createCollaborationService({allowedTokens: ['secret'], maxPeersPerRoom: 1});
    const first = sentMessages();

    expect(service.registerClient({
      roomId: 'dark-room',
      peerId: 'peer-1',
      token: 'wrong',
      send: first.send,
    })).toEqual({ok: false, reason: 'Collaboration token rejected.'});

    expect(service.registerClient({
      roomId: 'dark-room',
      peerId: 'peer-1',
      token: 'secret',
      send: first.send,
    })).toMatchObject({ok: true, roomId: 'dark-room', peerId: 'peer-1'});

    expect(service.registerClient({
      roomId: 'dark-room',
      peerId: 'peer-2',
      token: 'secret',
      send: jest.fn(),
    })).toEqual({ok: false, reason: 'Collaboration room is full.'});
  });

  it('broadcasts authorized presence only to peers in the same room', () => {
    const service = createCollaborationService();
    const first = sentMessages();
    const second = sentMessages();
    const otherRoom = sentMessages();
    const firstRegistration = service.registerClient({roomId: 'dark-room', peerId: 'a', send: first.send});
    service.registerClient({roomId: 'dark-room', peerId: 'b', send: second.send});
    service.registerClient({roomId: 'other-room', peerId: 'c', send: otherRoom.send});
    first.messages.length = 0;
    second.messages.length = 0;
    otherRoom.messages.length = 0;

    const presence = createPresence({
      peerId: 'a',
      displayName: 'A',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 1,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });

    if (!firstRegistration.ok) {
      throw new Error('Expected first peer registration.');
    }
    expect(service.receiveFromClient(
      firstRegistration.clientId,
      serializeCollaborationWireMessage({type: 'presence', presence}),
    )).toBe(true);

    expect(first.messages).toEqual([]);
    expect(second.messages).toHaveLength(1);
    expect(otherRoom.messages).toEqual([]);
  });

  it('retains room snapshots across reconnect and targets WebRTC signaling', () => {
    const service = createCollaborationService();
    const first = sentMessages();
    const second = sentMessages();
    const firstRegistration = service.registerClient({roomId: 'dark-room', peerId: 'a', send: first.send});
    const secondRegistration = service.registerClient({roomId: 'dark-room', peerId: 'b', send: second.send});
    if (!firstRegistration.ok || !secondRegistration.ok) {
      throw new Error('Expected peer registration.');
    }

    const presence = createPresence({
      peerId: 'a',
      displayName: 'A',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 1,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });
    service.receiveFromClient(
      firstRegistration.clientId,
      serializeCollaborationWireMessage({type: 'presence', presence}),
    );

    service.removeClient(firstRegistration.clientId);
    expect(service.roomSnapshot('dark-room')).toMatchObject({
      knownPeerIds: ['a', 'b'],
      presences: [presence],
    });

    const reconnected = sentMessages();
    service.registerClient({roomId: 'dark-room', peerId: 'a', send: reconnected.send});
    const roomState = parseCollaborationWireMessage(reconnected.messages[0]);
    expect(roomState).toMatchObject({
      type: 'room_state',
      snapshot: {knownPeerIds: ['a', 'b'], presences: [presence]},
    });

    second.messages.length = 0;
    const signal = createCollaborationSignal({
      roomId: 'dark-room',
      fromPeerId: 'a',
      toPeerId: 'b',
      kind: 'offer',
      payload: {sdp: 'v=0'},
      now: 1200,
    });
    const senderId = service.registerClient({roomId: 'dark-room', peerId: 'a', send: jest.fn()});
    if (!senderId.ok) {
      throw new Error('Expected signal sender registration.');
    }
    expect(service.receiveFromClient(
      senderId.clientId,
      serializeCollaborationWireMessage({type: 'signal', signal}),
    )).toBe(true);
    expect(second.messages.map(parseCollaborationWireMessage)).toEqual([{type: 'signal', signal}]);
  });

  it('hydrates retained snapshots for durable service restart', () => {
    const snapshots: CollaborationServiceRoomSnapshot[][] = [];
    const service = createCollaborationService({
      onSnapshot: nextSnapshots => snapshots.push(nextSnapshots),
    });
    const first = service.registerClient({roomId: 'dark-room', peerId: 'a', send: jest.fn()});
    if (!first.ok) {
      throw new Error('Expected first peer registration.');
    }

    const presence = createPresence({
      peerId: 'a',
      displayName: 'A',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 1,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });
    const operation = createCollaborationOperation({
      peerId: 'a',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 1,
      now: 1000,
      targetType: 'track',
      targetId: 'track-1',
      action: 'rename',
      conflictKey: 'track:track-1:name',
      payload: {name: 'Lead'},
    });

    service.receiveFromClient(first.clientId, serializeCollaborationWireMessage({type: 'presence', presence}));
    service.receiveFromClient(first.clientId, serializeCollaborationWireMessage({type: 'operation', operation}));
    const persisted = snapshots.at(-1) ?? [];
    expect(persisted[0]).toMatchObject({
      roomId: 'dark-room',
      knownPeerIds: ['a'],
      presences: [presence],
      operations: [operation],
    });

    const restoredMessages = sentMessages();
    const restored = createCollaborationService({initialSnapshots: persisted});
    restored.registerClient({roomId: 'dark-room', peerId: 'b', send: restoredMessages.send});
    const roomState = parseCollaborationWireMessage(restoredMessages.messages[0]);
    expect(roomState).toMatchObject({
      type: 'room_state',
      snapshot: {knownPeerIds: ['a', 'b'], presences: [presence], operations: [operation]},
    });
  });

  it('rejects spoofed peer operations and keeps server conflict policy deterministic', () => {
    const service = createCollaborationService();
    const receiver = sentMessages();
    const first = service.registerClient({roomId: 'dark-room', peerId: 'a', send: jest.fn()});
    service.registerClient({roomId: 'dark-room', peerId: 'b', send: receiver.send});
    receiver.messages.length = 0;
    if (!first.ok) {
      throw new Error('Expected first peer registration.');
    }

    const accepted = createCollaborationOperation({
      peerId: 'a',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 2,
      now: 100,
      targetType: 'track',
      targetId: 'track-1',
      action: 'rename',
      conflictKey: 'track:track-1:name',
      payload: {name: 'Lead'},
    });
    const stale = createCollaborationOperation({
      peerId: 'a',
      roomId: 'dark-room',
      clientSeq: 2,
      clock: 1,
      now: 90,
      targetType: 'track',
      targetId: 'track-1',
      action: 'rename',
      conflictKey: 'track:track-1:name',
      payload: {name: 'Old Lead'},
    });
    const spoofed = {...accepted, peerId: 'b'};

    expect(service.receiveFromClient(
      first.clientId,
      serializeCollaborationWireMessage({type: 'operation', operation: spoofed}),
    )).toBe(false);
    expect(service.receiveFromClient(
      first.clientId,
      serializeCollaborationWireMessage({type: 'operation', operation: accepted}),
    )).toBe(true);
    expect(service.receiveFromClient(
      first.clientId,
      serializeCollaborationWireMessage({type: 'operation', operation: stale}),
    )).toBe(false);

    expect(receiver.messages).toHaveLength(1);
    expect(service.roomSnapshot('dark-room').operations).toEqual([accepted]);
  });
});
