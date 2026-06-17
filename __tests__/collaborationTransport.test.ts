import {createPresence} from '../src/collaboration/collaborationRoom';
import {
  collaborationServiceUrl,
  createCollaborationOperation,
  createCollaborationSignal,
  parseCollaborationWireMessage,
  resolveCollaborationConflicts,
  sanitizeRemoteEndpoint,
  serializeCollaborationWireMessage,
} from '../src/collaboration/collaborationTransport';

describe('collaboration transport contracts', () => {
  it('builds a sanitized WebSocket service URL for remote rooms', () => {
    expect(sanitizeRemoteEndpoint('https://studio.example/ws')).toBe('');
    expect(collaborationServiceUrl(
      'wss://studio.example/ws',
      ' Dark Room! ',
      'peer-1',
      'secret',
    )).toBe('wss://studio.example/ws?room=dark-room&peer=peer-1&token=secret');
  });

  it('serializes and parses presence wire messages defensively', () => {
    const presence = createPresence({
      peerId: 'peer-2',
      displayName: 'Remote',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 4,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });
    const wire = serializeCollaborationWireMessage({type: 'presence', presence});

    expect(parseCollaborationWireMessage(wire)).toEqual({type: 'presence', presence});
    expect(parseCollaborationWireMessage('{bad json')).toBeNull();
    expect(parseCollaborationWireMessage({type: 'presence', presence: {}})).toBeNull();
  });

  it('serializes WebRTC signaling and room-state snapshots defensively', () => {
    const presence = createPresence({
      peerId: 'peer-2',
      displayName: 'Remote',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 4,
      selectedTrackId: null,
      selectedBlockId: null,
      now: 1000,
    });
    const operation = createCollaborationOperation({
      peerId: 'peer-2',
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
    const signal = createCollaborationSignal({
      roomId: 'dark-room',
      fromPeerId: 'peer-1',
      toPeerId: 'peer-2',
      kind: 'offer',
      payload: {sdp: 'v=0'},
      now: 1200,
    });

    expect(parseCollaborationWireMessage(
      serializeCollaborationWireMessage({type: 'signal', signal}),
    )).toEqual({type: 'signal', signal});
    expect(parseCollaborationWireMessage({
      type: 'room_state',
      snapshot: {roomId: 'dark-room', peerIds: ['peer-2'], presences: [presence], operations: [operation]},
    })).toEqual({
      type: 'room_state',
      snapshot: {roomId: 'dark-room', peerIds: ['peer-2'], presences: [presence], operations: [operation]},
    });
    expect(parseCollaborationWireMessage({type: 'signal', signal: {...signal, kind: 'bad'}})).toBeNull();
  });

  it('keeps deterministic last-writer-wins operations for shared conflict keys', () => {
    const first = createCollaborationOperation({
      peerId: 'peer-a',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 1,
      now: 100,
      targetType: 'clip',
      targetId: 'clip-1',
      action: 'move',
      conflictKey: 'clip:clip-1:position',
      payload: {startBeat: 2},
    });
    const second = createCollaborationOperation({
      peerId: 'peer-b',
      roomId: 'dark-room',
      clientSeq: 1,
      clock: 2,
      now: 90,
      targetType: 'clip',
      targetId: 'clip-1',
      action: 'move',
      conflictKey: 'clip:clip-1:position',
      payload: {startBeat: 4},
    });

    const result = resolveCollaborationConflicts([second, first, second]);

    expect(result.accepted).toEqual([second]);
    expect(result.superseded).toEqual([first]);
  });
});
