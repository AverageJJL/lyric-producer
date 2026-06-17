import {emptyTrackFxState} from '../src/native/fxContract';
import {
  applyAiFxTargetToState,
  parseAiFxJson,
  validateAiFxPayload,
} from '../src/orchestration/aiFxControl';

describe('AI FX control parsing', () => {
  it('parses EQ and compressor targets into clamped parameter values', () => {
    const result = validateAiFxPayload({
      fx: [
        {
          trackId: 'track-vocal',
          slot: 'eq',
          enabled: true,
          values: {treble: 1.2, lowMid: -0.2},
          reasoning: 'Open the vocal while cutting mud.',
        },
        {
          trackId: 'track-vocal',
          slot: 'compressor',
          params: {threshold: 0.35, ratio: 0.62},
        },
      ],
    });

    expect(result).toMatchObject({ok: true});
    expect(result.ok ? result.targets : []).toEqual([
      {
        trackId: 'track-vocal',
        slot: 'eq',
        pluginId: 'airwindows:Parametric',
        enabled: true,
        values: {treble: 1, lowMid: 0},
        reasoning: 'Open the vocal while cutting mud.',
      },
      {
        trackId: 'track-vocal',
        slot: 'compressor',
        pluginId: 'airwindows:Logical4',
        values: {threshold: 0.35, ratio: 0.62},
      },
    ]);
  });

  it('strips mono-unsafe pan, width, and spatial suggestions from executable values', () => {
    const result = validateAiFxPayload({
      targets: [
        {
          trackId: 'track-bass',
          slot: 'eq',
          values: {treble: 0.65, pan: 0.8, stereoWidth: 1, spatialImage: 0.9},
        },
        {
          trackId: 'track-bass',
          slot: 'stereo_imager',
          values: {width: 1},
        },
      ],
    });

    expect(result).toMatchObject({ok: true});
    if (!result.ok) {
      throw new Error('expected mono-unsafe fields to be stripped, not rejected');
    }
    expect(result.targets).toEqual([{
      trackId: 'track-bass',
      slot: 'eq',
      pluginId: 'airwindows:Parametric',
      values: {treble: 0.65},
    }]);
    expect(result.stripped.map(item => item.field)).toEqual([
      'pan',
      'stereoWidth',
      'spatialImage',
      'stereo_imager',
    ]);
  });

  it('rejects unsupported non-spatial slots and unknown safe parameters', () => {
    const result = parseAiFxJson(JSON.stringify({
      fx: [
        {trackId: 'track-1', slot: 'reverb', values: {roomSize: 0.8}},
        {trackId: 'track-1', slot: 'eq', values: {mystery: 0.4}},
      ],
    }));

    expect(result).toMatchObject({ok: false});
    expect(result.ok ? [] : result.errors).toEqual(expect.arrayContaining([
      {path: 'fx[0].slot', message: 'Expected slot eq or compressor.'},
      {path: 'fx[1].values.mystery', message: 'Unsupported eq parameter "mystery".'},
    ]));
  });

  it('applies parsed targets to local FX state without calling native', () => {
    const state = emptyTrackFxState('track-1');
    const next = applyAiFxTargetToState(state, {
      trackId: 'track-1',
      slot: 'compressor',
      pluginId: 'airwindows:Logical4',
      enabled: true,
      values: {threshold: 0.25},
    });

    const compressor = next.slots.find(slot => slot.slot === 'compressor');
    expect(compressor).toMatchObject({
      enabled: true,
      params: {
        values: expect.objectContaining({threshold: 0.25}),
      },
    });
  });
});
