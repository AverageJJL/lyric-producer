import {
  collaborationPeerList,
  createPresence,
  emptyCollaborationRoom,
  peerColor,
  pruneStalePeers,
  sanitizeCollaborationRoomId,
  sanitizePeerName,
  upsertPeerPresence,
} from '../src/collaboration/collaborationRoom';

describe('collaboration room state', () => {
  it('sanitizes room and peer identity fields', () => {
    expect(sanitizeCollaborationRoomId(' Dark Room! ')).toBe('dark-room');
    expect(sanitizeCollaborationRoomId('   ')).toBe('local-studio');
    expect(sanitizePeerName('  Morgan   Producer  ')).toBe('Morgan Producer');
    expect(peerColor('peer-a')).toMatch(/^#/);
  });

  it('accepts current presence for peers in the same room only', () => {
    const room = emptyCollaborationRoom('dark-room', 'self');
    const peer = createPresence({
      peerId: 'peer-2',
      displayName: 'Remote',
      color: '#8ee3f5',
      roomId: 'dark-room',
      playheadBeat: 12.5,
      selectedTrackId: 'track-1',
      selectedBlockId: 'clip-1',
      now: 1000,
    });
    const stale = {...peer, playheadBeat: 1, updatedAt: 999};
    const otherRoom = {...peer, peerId: 'peer-3', roomId: 'other-room'};

    const withPeer = upsertPeerPresence(room, peer);
    expect(upsertPeerPresence(withPeer, stale).peers['peer-2'].playheadBeat).toBe(12.5);
    expect(upsertPeerPresence(withPeer, otherRoom).peers['peer-3']).toBeUndefined();
    expect(collaborationPeerList(withPeer)).toEqual([peer]);
  });

  it('prunes stale peers by last presence time', () => {
    const room = upsertPeerPresence(
      emptyCollaborationRoom('dark-room', 'self'),
      createPresence({
        peerId: 'peer-2',
        displayName: 'Remote',
        color: '#8ee3f5',
        roomId: 'dark-room',
        playheadBeat: 0,
        selectedTrackId: null,
        selectedBlockId: null,
        now: 1000,
      }),
    );

    expect(pruneStalePeers(room, 16_001).peers['peer-2']).toBeUndefined();
    expect(pruneStalePeers(room, 10_000).peers['peer-2']).toBeDefined();
  });
});
