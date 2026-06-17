import {
  emptyTrackFxState,
  getTrackFxState,
  normalizePluginChain,
  summarizeTrackFx,
  type TrackFxState,
} from '../src/native/fxContract';
import {normalizeTrackFxForSet} from '../src/native/fxContractOps';

describe('fx contract', () => {
  beforeEach(() => {
    window.audioEngine = undefined;
  });

  it('returns stable default slots when native FX is unavailable', () => {
    const state = emptyTrackFxState('track-a');

    expect(state.slots.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
    expect(state.slots[0].params.pluginId).toBe('airwindows:Parametric');
    expect(state.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
    expect(getTrackFxState('track-a')).toEqual(state);
  });

  it('preserves native plugin-specific FX from get_track_fx responses', () => {
    const nativeState: TrackFxState = {
      trackId: 'track-a',
      slots: [
        {
          slot: 'eq',
          enabled: true,
          params: {
            pluginId: 'airwindows:Parametric',
            values: {treble: 0.62, dryWet: 1},
          },
        },
        {
          slot: 'compressor',
          enabled: false,
          params: {
            pluginId: 'airwindows:Logical4',
            values: {threshold: 0.4, ratio: 0.25, speed: 0.2, makeupGain: 0.5, dryWet: 1},
          },
        },
        {
          slot: 'reverb',
          enabled: true,
          params: {
            pluginId: 'airwindows:MatrixVerb',
            values: {roomSize: 0.65, dryWet: 0.24},
          },
        },
      ],
    };

    const sendCommand = jest.fn(() => JSON.stringify({ok: true, data: nativeState}));
    window.audioEngine = {sendCommand};

    const loaded = getTrackFxState('track-a');
    expect(loaded).toMatchObject(nativeState);
    expect(loaded.pluginChain?.map(slot => slot.pluginId)).toEqual([
      'airwindows:Parametric',
      'airwindows:Logical4',
      'airwindows:MatrixVerb',
    ]);
    expect(sendCommand).toHaveBeenCalledWith('get_track_fx', JSON.stringify({trackId: 'track-a'}));
  });

  it('summarizes enabled slots and plugin ids for snapshots', () => {
    const summary = summarizeTrackFx({
      trackId: 'track-a',
      slots: [
        {
          slot: 'eq',
          enabled: true,
          params: {pluginId: 'airwindows:Parametric', values: {dryWet: 1}},
        },
        {
          slot: 'compressor',
          enabled: false,
          params: {pluginId: 'airwindows:Logical4', values: {dryWet: 1}},
        },
        {
          slot: 'reverb',
          enabled: true,
          params: {pluginId: 'airwindows:MatrixVerb', values: {dryWet: 0.3}},
        },
      ],
    });

    expect(summary).toEqual({
      trackId: 'track-a',
      enabledSlots: ['eq', 'reverb'],
      plugins: {
        eq: 'airwindows:Parametric',
        compressor: 'airwindows:Logical4',
        reverb: 'airwindows:MatrixVerb',
      },
      pluginChain: [
        expect.objectContaining({slot: 'eq', pluginId: 'airwindows:Parametric', status: 'available'}),
        expect.objectContaining({slot: 'compressor', pluginId: 'airwindows:Logical4'}),
        expect.objectContaining({slot: 'reverb', pluginId: 'airwindows:MatrixVerb'}),
      ],
    });
  });

  it('normalizes missing and recovered plugin-chain metadata', () => {
    const state = emptyTrackFxState('track-a');
    const chain = normalizePluginChain({
      ...state,
      pluginChain: [
        {
          slot: 'reverb',
          pluginId: 'external:space',
          displayName: 'Space Verb',
          format: 'external_vst3',
          enabled: false,
          bypassed: true,
          order: 0,
          status: 'missing',
          recoveryHint: 'Install Space Verb.vst3',
        },
      ],
    });

    expect(chain.map(slot => slot.slot)).toEqual(['reverb', 'eq', 'compressor']);
    expect(chain[0]).toMatchObject({
      pluginId: 'external:space',
      status: 'missing',
      recoveryHint: 'Install Space Verb.vst3',
    });
  });

  it('preserves available external plugin-chain entries from native', () => {
    const state = emptyTrackFxState('track-a');
    const chain = normalizePluginChain({
      ...state,
      pluginChain: [
        {
          slot: 'eq',
          pluginId: 'external:channel-strip',
          displayName: 'Channel Strip',
          format: 'external_vst3',
          enabled: true,
          bypassed: false,
          order: 0,
          status: 'available',
        },
        {
          slot: 'compressor',
          pluginId: 'airwindows:Parametric',
          displayName: 'Parametric',
          format: 'builtin_airwindows',
          enabled: true,
          bypassed: false,
          order: 1,
          status: 'available',
        },
      ],
    });

    expect(chain[0]).toMatchObject({
      slot: 'eq',
      status: 'available',
      recoveryHint: undefined,
    });
    expect(chain[1]).toMatchObject({
      slot: 'compressor',
      status: 'missing',
      recoveryHint: 'Only the built-in Logical4 processor can be hosted in this slot.',
    });
  });

  it('marks disabled external plugin-chain entries as recoverable metadata', () => {
    const state = emptyTrackFxState('track-a');
    const chain = normalizePluginChain({
      ...state,
      pluginChain: [{
        slot: 'eq',
        pluginId: 'external:channel-strip',
        displayName: 'Channel Strip',
        format: 'external_vst3',
        enabled: true,
        bypassed: false,
        order: 0,
        status: 'disabled',
      }],
    });

    expect(chain[0]).toMatchObject({
      slot: 'eq',
      status: 'disabled',
      recoveryHint: 'External VST3 plugin hosting is disabled in this build.',
    });
  });

  it('normalizes payloads to include all three slots in order', () => {
    const normalized = normalizeTrackFxForSet(emptyTrackFxState('track-a'));
    expect(normalized.slots.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
    expect(normalized.slots[0].params.pluginId).toBe('airwindows:Parametric');
    expect(normalized.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
  });
});
