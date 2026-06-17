import {emptyTrackFxState, type TrackFxState} from '../src/native/fxContract';
import {
  addExternalPluginChainSlot,
  addPluginChainSlot,
  movePluginChainSlot,
  normalizeTrackFxForSet,
  removePluginChainSlot,
  setTrackFxState,
  updateFxSlot,
} from '../src/native/fxContractOps';

describe('fxContractOps', () => {
  beforeEach(() => {
    window.audioEngine = undefined;
  });

  it('clamps plugin values to 0..1 for set payloads', () => {
    const state: TrackFxState = {
      trackId: 't1',
      slots: [
        {
          slot: 'eq',
          enabled: true,
          params: {
            pluginId: 'airwindows:Parametric',
            values: {treble: 1.5, dryWet: -0.2},
          },
        },
        {
          slot: 'compressor',
          enabled: false,
          params: {
            pluginId: 'airwindows:Logical4',
            values: {threshold: 0.5, ratio: 0.2, speed: 0.19, makeupGain: 0.5, dryWet: 1},
          },
        },
        {
          slot: 'reverb',
          enabled: false,
          params: {
            pluginId: 'airwindows:MatrixVerb',
            values: {roomSize: 0.5, dryWet: 0.2},
          },
        },
      ],
    };

    const normalized = normalizeTrackFxForSet(state);
    const eqValues = normalized.slots.find(slot => slot.slot === 'eq')?.params.values;
    expect(eqValues?.treble).toBe(1);
    expect(eqValues?.dryWet).toBe(0);
    expect(normalized.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
  });

  it('reorders plugin-chain metadata without changing managed slot payload order', () => {
    const moved = movePluginChainSlot(emptyTrackFxState('t1'), 'reverb', 'earlier');
    expect(moved.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'reverb', 'compressor']);

    const normalized = normalizeTrackFxForSet(moved);
    expect(normalized.slots.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
    expect(normalized.pluginChain?.map(slot => slot.slot)).toEqual(['eq', 'reverb', 'compressor']);
  });

  it('keeps slot payloads and chain metadata aligned for managed add/remove', () => {
    const added = addPluginChainSlot(emptyTrackFxState('t1'), 'reverb');
    expect(added.slots.find(slot => slot.slot === 'reverb')?.enabled).toBe(true);
    expect(added.pluginChain?.find(slot => slot.slot === 'reverb')).toMatchObject({
      enabled: true,
      bypassed: false,
      status: 'available',
    });

    const removed = removePluginChainSlot(added, 'reverb');
    expect(removed.slots.find(slot => slot.slot === 'reverb')?.enabled).toBe(false);
    expect(removed.pluginChain?.find(slot => slot.slot === 'reverb')).toMatchObject({
      enabled: false,
      bypassed: true,
    });
  });

  it('places an external candidate into a fixed host slot', () => {
    const added = addExternalPluginChainSlot(emptyTrackFxState('t1'), 'compressor', {
      pluginId: 'external_vst3:/plugins/Shape.vst3',
      displayName: 'Shape',
      format: 'external_vst3',
      path: '/plugins/Shape.vst3',
      status: 'available',
    });

    expect(added.slots.find(slot => slot.slot === 'compressor')?.enabled).toBe(true);
    expect(added.pluginChain?.find(slot => slot.slot === 'compressor')).toMatchObject({
      pluginId: 'external_vst3:/plugins/Shape.vst3',
      displayName: 'Shape',
      format: 'external_vst3',
      enabled: true,
      bypassed: false,
      status: 'available',
    });
  });

  it('returns native-confirmed state from set_track_fx', () => {
    const confirmed = emptyTrackFxState('t1');
    confirmed.slots[0].enabled = true;
    confirmed.slots[0].params.values.treble = 0.62;
    confirmed.nativePluginOrder = ['eq', 'compressor', 'reverb'];
    confirmed.nativePluginBypass = {eq: false, compressor: true, reverb: true};

    window.audioEngine = {
      sendCommand: jest.fn(() => JSON.stringify({ok: true, data: confirmed})),
    };

    const result = setTrackFxState(emptyTrackFxState('t1'));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.slots[0].enabled).toBe(true);
      expect(result.state.slots[0].params.values.treble).toBe(0.62);
      expect(result.state.nativePluginOrder).toEqual(['eq', 'compressor', 'reverb']);
      expect(result.state.nativePluginBypass).toEqual({eq: false, compressor: true, reverb: true});
    }
  });

  it('reverts to previous state on native error', () => {
    const previous = updateFxSlot(emptyTrackFxState('t1'), 'eq', {enabled: true});
    window.audioEngine = {
      sendCommand: jest.fn(() =>
        JSON.stringify({ok: false, error: {message: 'FX payload requires eq, compressor, and reverb slots.'}}),
      ),
    };

    const result = setTrackFxState(previous);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.previousState).toEqual(previous);
    }
  });
});
