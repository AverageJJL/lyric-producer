import {
  emptyProjectSnapshot,
  type ProjectSnapshot,
} from '../src/arrangement/projectSnapshot';
import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';
import {validateAiFxPayload} from '../src/orchestration/aiFxControl';
import {detectMixAnomalies} from '../src/orchestration/mixAnomalyDetection';

function track(overrides: Partial<DAWTrack> & Pick<DAWTrack, 'id' | 'name'>): DAWTrack {
  return {
    id: overrides.id,
    name: overrides.name,
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

function block(overrides: Partial<DAWBlock> & Pick<DAWBlock, 'id' | 'trackId'>): DAWBlock {
  return {
    id: overrides.id,
    trackId: overrides.trackId,
    name: overrides.id,
    startBeat: 0,
    lengthBeats: 8,
    type: 'midi',
    color: '#4a7fd4',
    ...overrides,
  };
}

function snapshot(tracks: DAWTrack[], blocks: DAWBlock[]): ProjectSnapshot {
  return {...emptyProjectSnapshot(), tracks, blocks};
}

function expectValidTargets(targets: unknown[]) {
  expect(validateAiFxPayload({targets})).toMatchObject({ok: true});
}

describe('mix anomaly detection', () => {
  it('suggests low-mid EQ cuts on secondary overlapping instruments', () => {
    const result = detectMixAnomalies(snapshot(
      [
        track({
          id: 'bass',
          name: 'Bass',
          instrumentId: 'bass_growly',
          presetId: 'growly_bass_lite',
        }),
        track({
          id: 'piano',
          name: 'Piano',
          instrumentId: 'keys_piano',
          presetId: 'splendid_grand_lite',
        }),
      ],
      [
        block({id: 'bass-clip', trackId: 'bass', startBeat: 0, lengthBeats: 8}),
        block({id: 'piano-clip', trackId: 'piano', startBeat: 4, lengthBeats: 8}),
      ],
    ));

    expect(result.anomalies).toContainEqual(expect.objectContaining({
      kind: 'low_mid_congestion',
      trackId: 'piano',
      relatedTrackId: 'bass',
    }));
    expect(result.fxTargets).toContainEqual(expect.objectContaining({
      trackId: 'piano',
      slot: 'eq',
      pluginId: 'airwindows:Parametric',
      values: expect.objectContaining({lowMid: 0.36, lmFreq: 0.42}),
    }));
    expectValidTargets(result.fxTargets);
  });

  it('suggests compressor targets when instruments mask a vocal lane', () => {
    const result = detectMixAnomalies(snapshot(
      [
        track({
          id: 'vocal',
          name: 'Lead Vocal',
          type: 'voice_audio',
          instrumentId: 'voice_audio',
          presetId: 'voice',
        }),
        track({
          id: 'guitar',
          name: 'Guitar',
          instrumentId: 'guitar_emily',
          presetId: 'emily_guitar_lite',
        }),
      ],
      [
        block({id: 'vocal-clip', trackId: 'vocal', type: 'audio'}),
        block({id: 'guitar-clip', trackId: 'guitar', startBeat: 2, lengthBeats: 4}),
      ],
    ));

    expect(result.anomalies).toContainEqual(expect.objectContaining({
      kind: 'vocal_masking',
      trackId: 'guitar',
      relatedTrackId: 'vocal',
    }));
    expect(result.fxTargets).toContainEqual(expect.objectContaining({
      trackId: 'guitar',
      slot: 'compressor',
      values: expect.objectContaining({threshold: 0.38, ratio: 0.42}),
    }));
    expect(result.fxTargets).not.toContainEqual(expect.objectContaining({trackId: 'vocal'}));
    expectValidTargets(result.fxTargets);
  });

  it('suggests compressor targets for native-derived headroom spikes', () => {
    const result = detectMixAnomalies(snapshot(
      [
        track({
          id: 'snare-print',
          name: 'Snare Print',
          type: 'voice_audio',
          instrumentId: 'voice_audio',
          presetId: 'voice',
        }),
      ],
      [
        block({
          id: 'snare-hit',
          trackId: 'snare-print',
          type: 'audio',
          sourcePeakAmplitude: 0.97,
        }),
      ],
    ));

    expect(result.anomalies).toContainEqual(expect.objectContaining({
      kind: 'headroom_transient_spike',
      trackId: 'snare-print',
      severity: 'high',
    }));
    expect(result.fxTargets).toContainEqual(expect.objectContaining({
      trackId: 'snare-print',
      slot: 'compressor',
      values: expect.objectContaining({threshold: 0.32, speed: 0.22}),
    }));
    expectValidTargets(result.fxTargets);
  });

  it('ignores non-overlapping clips and avoids executable targets on locked tracks', () => {
    const clean = detectMixAnomalies(snapshot(
      [
        track({id: 'vocal', name: 'Vocal', type: 'voice_audio'}),
        track({id: 'keys', name: 'Keys', instrumentId: 'keys_piano'}),
      ],
      [
        block({id: 'vocal-clip', trackId: 'vocal', startBeat: 0, lengthBeats: 2}),
        block({id: 'keys-clip', trackId: 'keys', startBeat: 4, lengthBeats: 2}),
      ],
    ));

    expect(clean).toEqual({anomalies: [], fxTargets: []});

    const locked = detectMixAnomalies(snapshot(
      [
        track({id: 'bass', name: 'Bass', instrumentId: 'bass_growly'}),
        track({id: 'piano', name: 'Piano', instrumentId: 'keys_piano', isLocked: true}),
      ],
      [
        block({id: 'bass-clip', trackId: 'bass'}),
        block({id: 'piano-clip', trackId: 'piano'}),
      ],
    ));

    expect(locked.anomalies).toContainEqual(expect.objectContaining({
      kind: 'low_mid_congestion',
      trackId: 'piano',
    }));
    expect(locked.fxTargets).toEqual([]);
  });
});
