import {
  copilotDrumPatternEditsToOperations,
  importCopilotDrumPatternOption,
  sanitizeCopilotDrumPatternOptions,
  type CopilotDrumPatternOption,
} from '../src/assistant/copilotDrumPatternOptions';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {createTrackFromTemplate} from '../src/music/trackTemplates';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(tracks: DAWTrack[] = []): void {
  useDAWStore.setState({
    bpm: 120,
    tracks,
    blocks: [],
    patterns: {},
    selectedTrackId: tracks[0]?.id ?? null,
    selectedBlockId: null,
    selectedBlockIds: [],
    playheadBeat: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    syncSource: 'ui',
  });
}

const beatOption: CopilotDrumPatternOption = {
  id: 'beat-a',
  label: 'Backbeat',
  description: 'Kick and snare.',
  startBeat: 0,
  lengthBeats: 4,
  kitId: 'pop_basic',
  lanes: {
    kick: [0, 8],
    snare: [4, 12],
    hatClosed: [0, 2, 4, 6, 8, 10, 12, 14],
    hatOpen: [],
    tom1: [],
    tom2: [],
    perc: [],
    clap: [],
  },
};

describe('Copilot drum pattern options', () => {
  it('sanitizes canonical drum lanes and drops invalid steps', () => {
    const [option] = sanitizeCopilotDrumPatternOptions([{
      ...beatOption,
      lanes: {...beatOption.lanes, kick: [-1, 0, 0, 16, 8], cowbell: [1]},
    }]);

    expect(option?.lanes.kick).toEqual([0, 8]);
    expect(option?.lanes.snare).toEqual([4, 12]);
    expect(JSON.stringify(option)).not.toContain('cowbell');
  });

  it('imports onto an existing drum machine as an audio pattern block', () => {
    const drums = createTrackFromTemplate('drum_machine', 0, {id: 'track-drums'});
    resetStore([drums]);

    const result = importCopilotDrumPatternOption(beatOption);
    const state = useDAWStore.getState();
    const block = state.blocks.find(item => item.id === (result.ok ? result.clipId : ''));

    expect(result).toMatchObject({ok: true, trackId: 'track-drums'});
    expect(block).toMatchObject({type: 'audio', patternId: expect.any(String)});
    expect(block?.type).not.toBe('midi');
    expect(state.patterns[block!.patternId!].steps.snare[4]).toBe(true);
  });

  it('rejects timeline drops on non-drum tracks', () => {
    const piano = createTrackFromTemplate('virtual_instrument', 0, {id: 'track-piano'});
    resetStore([piano]);

    expect(importCopilotDrumPatternOption(beatOption, {trackId: 'track-piano', startBeat: 2}))
      .toMatchObject({ok: false});
  });

  it('creates a drum track and reuses the default clip when no drum track exists', () => {
    resetStore();

    const result = importCopilotDrumPatternOption(beatOption);
    const state = useDAWStore.getState();

    expect(result).toMatchObject({ok: true});
    expect(state.tracks[0]).toMatchObject({type: 'drum_machine'});
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]).toMatchObject({type: 'audio', name: 'Backbeat'});
  });

  it('maps whole-pattern edits to upsertDrumPattern operations', () => {
    const drums = createTrackFromTemplate('drum_machine', 0, {id: 'track-drums'});
    const pattern = createEmptyPattern('Pattern A', 'pat-a');
    const block = {
      id: 'clip-drums',
      trackId: 'track-drums',
      name: 'Pattern A',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio' as const,
      color: '#c45c26',
      patternId: 'pat-a',
    };

    const result = copilotDrumPatternEditsToOperations(
      [{op: 'replaceDrumPattern', blockId: 'clip-drums', lanes: beatOption.lanes}],
      {tracks: [drums], blocks: [block], patterns: {'pat-a': pattern}} as ReturnType<typeof useDAWStore.getState>,
    );

    expect(result).toMatchObject({ok: true});
    expect(result.ok ? result.operations[0] : null).toMatchObject({
      op: 'upsertDrumPattern',
      pattern: {id: 'pat-a'},
    });
  });
});
