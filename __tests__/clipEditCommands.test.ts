import {
  copySelectedClip,
  duplicateSelectedClip,
  glueSelectedMidiClips,
  pasteClipboardAtPlayhead,
  repeatSelectedClipsOnce,
  splitSelectedClipAtPlayhead,
  trimSelectedClipEndToPlayhead,
  trimSelectedClipStartToPlayhead,
} from '../src/arrangement/clipEditCommands';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
};

function resetStore(blocks: DAWBlock[]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks,
    selectedBlockId: blocks[0]?.id ?? null,
    selectedBlockIds: blocks[0] ? [blocks[0].id] : [],
    selectedTrackId: track.id,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
  });
}

function midiBlock(updates?: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-1',
    trackId: track.id,
    name: 'Lead',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
    ...updates,
  };
}

describe('clip edit commands', () => {
  it('copies and pastes the selected clip at the playhead', () => {
    resetStore([midiBlock()]);
    useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});

    expect(copySelectedClip()).toBe(true);
    expect(pasteClipboardAtPlayhead()).toBe(true);

    const blocks = useDAWStore.getState().blocks;
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toMatchObject({
      trackId: track.id,
      startBeat: 8,
      lengthBeats: 4,
    });
    expect(blocks[1]?.id).not.toBe('clip-1');
    expect(useDAWStore.getState().selectedBlockId).toBe(blocks[1]?.id);
  });

  it('duplicates the selected clip after its end and records undo history', () => {
    resetStore([midiBlock()]);

    expect(duplicateSelectedClip()).toBe(true);
    expect(useDAWStore.getState().blocks[1]).toMatchObject({startBeat: 4});

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks).toHaveLength(1);
  });

  it('splits MIDI notes at the playhead', () => {
    resetStore([
      midiBlock({
        notes: [
          {note: 60, velocity: 90, startBeat: 1, lengthBeats: 2},
          {note: 64, velocity: 80, startBeat: 3, lengthBeats: 0.5},
        ],
      }),
    ]);
    useDAWStore.getState().setPlayheadBeat(2, {syncTransport: false});

    expect(splitSelectedClipAtPlayhead()).toBe(true);

    const [left, right] = useDAWStore.getState().blocks;
    expect(left).toMatchObject({id: 'clip-1', startBeat: 0, lengthBeats: 2});
    expect(left?.notes).toEqual([{note: 60, velocity: 90, startBeat: 1, lengthBeats: 1}]);
    expect(right).toMatchObject({startBeat: 2, lengthBeats: 2});
    expect(right?.notes).toEqual([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 1},
      {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
    ]);
  });

  it('splits audio clips with the correct source offset', () => {
    resetStore([
      {
        ...midiBlock({
          type: 'audio',
          notes: undefined,
          startBeat: 2,
          lengthBeats: 6,
          sourceLengthBeats: 12,
          sourceOffsetBeats: 1,
        }),
      },
    ]);
    useDAWStore.getState().setPlayheadBeat(4, {syncTransport: false});

    expect(splitSelectedClipAtPlayhead()).toBe(true);

    const [left, right] = useDAWStore.getState().blocks;
    expect(left).toMatchObject({startBeat: 2, lengthBeats: 2, sourceOffsetBeats: 1});
    expect(right).toMatchObject({startBeat: 4, lengthBeats: 4, sourceOffsetBeats: 3});
  });

  it('trims the selected MIDI clip end to the playhead', () => {
    resetStore([
      midiBlock({
        lengthBeats: 6,
        notes: [
          {note: 60, velocity: 90, startBeat: 1, lengthBeats: 3},
          {note: 64, velocity: 80, startBeat: 5, lengthBeats: 1},
        ],
      }),
    ]);
    useDAWStore.getState().setPlayheadBeat(3, {syncTransport: false});

    expect(trimSelectedClipEndToPlayhead()).toBe(true);

    const [block] = useDAWStore.getState().blocks;
    expect(block).toMatchObject({startBeat: 0, lengthBeats: 3});
    expect(block?.notes).toEqual([{note: 60, velocity: 90, startBeat: 1, lengthBeats: 2}]);
  });

  it('trims the selected audio clip start to the playhead with source offset', () => {
    resetStore([
      midiBlock({
        type: 'audio',
        notes: undefined,
        startBeat: 2,
        lengthBeats: 6,
        sourceLengthBeats: 12,
        sourceOffsetBeats: 1,
      }),
    ]);
    useDAWStore.getState().setPlayheadBeat(5, {syncTransport: false});

    expect(trimSelectedClipStartToPlayhead()).toBe(true);

    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 5,
      lengthBeats: 3,
      sourceOffsetBeats: 4,
    });
  });

  it('glues selected MIDI clips and records one undo step', () => {
    resetStore([
      midiBlock({
        id: 'clip-a',
        startBeat: 0,
        lengthBeats: 2,
        notes: [{note: 60, velocity: 90, startBeat: 0.5, lengthBeats: 1}],
      }),
      midiBlock({
        id: 'clip-b',
        startBeat: 4,
        lengthBeats: 2,
        notes: [{note: 67, velocity: 70, startBeat: 0, lengthBeats: 1}],
      }),
    ]);
    useDAWStore.setState({
      selectedBlockId: 'clip-a',
      selectedBlockIds: ['clip-a', 'clip-b'],
    });

    expect(glueSelectedMidiClips()).toBe(true);

    const state = useDAWStore.getState();
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]).toMatchObject({id: 'clip-a', startBeat: 0, lengthBeats: 6});
    expect(state.blocks[0]?.notes).toEqual([
      {note: 60, velocity: 90, startBeat: 0.5, lengthBeats: 1},
      {note: 67, velocity: 70, startBeat: 4, lengthBeats: 1},
    ]);

    state.undo();
    expect(useDAWStore.getState().blocks).toHaveLength(2);
  });

  it('repeats the selected clip range and clones drum patterns', () => {
    const pattern = createEmptyPattern('Pattern A', 'pat-src');
    pattern.steps.kick[0] = true;
    resetStore([
      midiBlock({id: 'clip-a', startBeat: 0, lengthBeats: 2}),
      midiBlock({
        id: 'clip-drum',
        type: 'audio',
        notes: undefined,
        startBeat: 4,
        lengthBeats: 4,
        patternId: 'pat-src',
        sourceLengthBeats: 4,
        sourceOffsetBeats: 0,
      }),
    ]);
    useDAWStore.setState({
      patterns: {'pat-src': pattern},
      selectedBlockId: 'clip-drum',
      selectedBlockIds: ['clip-a', 'clip-drum'],
    });

    expect(repeatSelectedClipsOnce()).toBe(true);

    const state = useDAWStore.getState();
    const repeatedMidi = state.blocks.find(block => block.id.startsWith('clip-a-repeat'));
    const repeatedDrum = state.blocks.find(block => block.id.startsWith('clip-drum-repeat'));
    expect(repeatedMidi).toMatchObject({startBeat: 8, lengthBeats: 2});
    expect(repeatedDrum).toMatchObject({startBeat: 12, lengthBeats: 4});
    expect(repeatedDrum?.patternId).not.toBe('pat-src');
    expect(state.patterns[repeatedDrum!.patternId!].steps.kick[0]).toBe(true);
    expect(state.selectedBlockIds).toEqual([repeatedMidi!.id, repeatedDrum!.id]);

    state.undo();
    expect(useDAWStore.getState().blocks).toHaveLength(2);
  });
});
