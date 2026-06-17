import {
  MASTER_OUTPUT_ID,
  normalizeTrackOutputTarget,
  normalizeTrackRoutingRole,
  normalizeTrackRoutingSends,
  normalizeTrackSidechainSource,
  removeTrackRoutingTarget,
  storedTrackRoutingRole,
  validateTrackRouting,
} from '../src/music/trackRouting';
import type {DAWTrack} from '../src/store/useDAWStore';

function track(id: string, overrides?: Partial<DAWTrack>): DAWTrack {
  return {
    id,
    name: id,
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
    ...overrides,
  };
}

describe('track routing metadata', () => {
  it('normalizes invalid outputs to master and reports validation issues', () => {
    const tracks = [
      track('track-a', {routingOutputTrackId: 'track-b'}),
      track('track-b', {routingOutputTrackId: 'track-a'}),
      track('track-c', {routingOutputTrackId: 'missing'}),
      track('track-d', {routingOutputTrackId: 'track-d'}),
      track('track-e', {routingSidechainSourceTrackId: 'track-e'}),
      track('track-f', {routingSidechainSourceTrackId: 'missing-sidechain'}),
      track('track-g', {routingRole: 'not-a-role' as never}),
    ];

    expect(normalizeTrackOutputTarget(tracks[0]!, tracks)).toBe(MASTER_OUTPUT_ID);
    expect(normalizeTrackOutputTarget(tracks[2]!, tracks)).toBe(MASTER_OUTPUT_ID);
    expect(normalizeTrackOutputTarget(tracks[3]!, tracks)).toBe(MASTER_OUTPUT_ID);
    expect(validateTrackRouting(tracks)).toEqual([
      {trackId: 'track-a', type: 'output-cycle', targetTrackId: 'track-b'},
      {trackId: 'track-b', type: 'output-cycle', targetTrackId: 'track-a'},
      {trackId: 'track-c', type: 'missing-output', targetTrackId: 'missing'},
      {trackId: 'track-d', type: 'self-output', targetTrackId: 'track-d'},
      {trackId: 'track-e', type: 'self-sidechain', targetTrackId: 'track-e'},
      {trackId: 'track-f', type: 'missing-sidechain', targetTrackId: 'missing-sidechain'},
      {trackId: 'track-g', type: 'invalid-role', routingRole: 'not-a-role'},
    ]);
  });

  it('normalizes routing roles and stores only explicit bus or aux metadata', () => {
    expect(normalizeTrackRoutingRole(undefined)).toBe('track');
    expect(normalizeTrackRoutingRole(' bus ')).toBe('bus');
    expect(normalizeTrackRoutingRole('aux_return')).toBe('aux_return');
    expect(normalizeTrackRoutingRole('not-a-role')).toBe('track');
    expect(storedTrackRoutingRole('track')).toBeUndefined();
    expect(storedTrackRoutingRole('aux_return')).toBe('aux_return');
  });

  it('filters invalid sends and clamps send gain', () => {
    const tracks = [
      track('track-a', {
        routingSends: [
          {targetTrackId: 'track-b', gainDb: 99, preFader: true},
          {targetTrackId: 'track-a', gainDb: -3},
          {targetTrackId: 'missing', gainDb: -9},
        ],
      }),
      track('track-b'),
    ];

    expect(normalizeTrackRoutingSends(tracks[0]!, tracks)).toEqual([
      {targetTrackId: 'track-b', gainDb: 6, preFader: true},
    ]);
    expect(validateTrackRouting(tracks)).toEqual([
      {trackId: 'track-a', type: 'self-send', targetTrackId: 'track-a'},
      {trackId: 'track-a', type: 'missing-send', targetTrackId: 'missing'},
    ]);
  });

  it('normalizes valid sidechain sources and clears invalid sources', () => {
    const tracks = [
      track('track-a', {routingSidechainSourceTrackId: 'track-b'}),
      track('track-b'),
      track('track-c', {routingSidechainSourceTrackId: 'missing'}),
    ];

    expect(normalizeTrackSidechainSource(tracks[0]!, tracks)).toBe('track-b');
    expect(normalizeTrackSidechainSource(tracks[1]!, tracks)).toBeUndefined();
    expect(normalizeTrackSidechainSource(tracks[2]!, tracks)).toBeUndefined();
  });

  it('removes deleted targets from outputs, sends, and sidechain sources', () => {
    const tracks = [
      track('track-a', {
        routingOutputTrackId: 'track-b',
        routingSends: [
          {targetTrackId: 'track-b', gainDb: -9},
          {targetTrackId: 'track-c', gainDb: -12},
        ],
        routingSidechainSourceTrackId: 'track-b',
      }),
      track('track-b'),
      track('track-c'),
    ];

    expect(removeTrackRoutingTarget(tracks, 'track-b')[0]).toMatchObject({
      routingSends: [{targetTrackId: 'track-c', gainDb: -12}],
    });
    expect(removeTrackRoutingTarget(tracks, 'track-b')[0]?.routingOutputTrackId)
      .toBeUndefined();
    expect(removeTrackRoutingTarget(tracks, 'track-b')[0]?.routingSidechainSourceTrackId)
      .toBeUndefined();
  });
});
