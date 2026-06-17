import {
  applyMixMeterUpdatePayload,
  parseMixMeterSnapshot,
  useMixMeterStore,
} from '../src/store/mixMeterStore';

const nativePayload = {
  schemaVersion: 1,
  source: 'tracktion_level_measurer',
  timestampMs: 1234,
  input: {
    active: true,
    deviceName: 'USB Mic',
    peak: {db: -12, linear: 0.25},
    peakHold: {db: -8, linear: 0.4},
    clipping: false,
    channels: [{index: 0, peak: {db: -12, linear: 0.25}}],
  },
  master: {
    peak: {db: -6, linear: 0.5},
    peakHold: {db: -3, linear: 0.7},
    clipping: false,
    channels: [{index: 0, peak: {db: -6, linear: 0.5}}],
  },
  tracks: [{
    trackId: 'track-1',
    name: 'Lead',
    peak: {db: -9, linear: 0.35},
    peakHold: {db: -4, linear: 0.63},
    clipping: true,
    channels: [{index: 1, peak: {db: -10, linear: 0.31}}],
  }],
};

describe('mix meter store', () => {
  beforeEach(() => useMixMeterStore.getState().clear());

  it('parses native Tracktion meter snapshots into track-indexed state', () => {
    const snapshot = parseMixMeterSnapshot(nativePayload);

    expect(snapshot?.source).toBe('tracktion_level_measurer');
    expect(snapshot?.input).toMatchObject({active: true, deviceName: 'USB Mic'});
    expect(snapshot?.master.peak.db).toBe(-6);
    expect(snapshot?.tracks['track-1']).toMatchObject({
      trackId: 'track-1',
      name: 'Lead',
      clipping: true,
    });
  });

  it('ignores malformed meter events instead of mutating state', () => {
    applyMixMeterUpdatePayload({schemaVersion: 99, source: 'test'});
    expect(useMixMeterStore.getState().snapshot).toBeNull();

    applyMixMeterUpdatePayload(nativePayload);
    expect(useMixMeterStore.getState().snapshot?.tracks['track-1']?.peakHold.db).toBe(-4);
  });
});
