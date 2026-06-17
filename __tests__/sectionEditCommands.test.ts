import {duplicateSectionOnce, splitSectionAtBeat} from '../src/arrangement/sectionEditCommands';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function block(updates: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-a',
    trackId: 'track-1',
    name: 'Clip',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
    ...updates,
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
    isRelativeSnapEnabled: false,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
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
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

beforeEach(resetStore);

test('duplicates clips fully contained by a section and records undo history', () => {
  const pattern = createEmptyPattern('Pattern A', 'pat-src');
  pattern.steps.kick[0] = true;
  useDAWStore.setState({
    patterns: {'pat-src': pattern},
    sections: [{id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 8}],
    blocks: [
      block({id: 'clip-midi', startBeat: 0, lengthBeats: 4}),
      block({
        id: 'clip-drum',
        type: 'audio',
        notes: undefined,
        startBeat: 4,
        lengthBeats: 4,
        patternId: 'pat-src',
        sourceLengthBeats: 4,
        sourceOffsetBeats: 0,
      }),
      block({id: 'outside', startBeat: 10, lengthBeats: 2}),
    ],
  });

  expect(duplicateSectionOnce('verse')).toBe(true);
  const state = useDAWStore.getState();
  const duplicatedMidi = state.blocks.find(item => item.id.startsWith('clip-midi-section'));
  const duplicatedDrum = state.blocks.find(item => item.id.startsWith('clip-drum-section'));
  expect(duplicatedMidi).toMatchObject({startBeat: 8, lengthBeats: 4});
  expect(duplicatedDrum).toMatchObject({startBeat: 12, lengthBeats: 4});
  expect(duplicatedDrum?.patternId).not.toBe('pat-src');
  expect(state.patterns[duplicatedDrum!.patternId!].steps.kick[0]).toBe(true);
  expect(state.sections.some(section => section.name === 'Verse Copy')).toBe(true);
  expect(state.selectedBlockIds).toEqual([duplicatedMidi!.id, duplicatedDrum!.id]);

  state.undo();
  expect(useDAWStore.getState().blocks).toHaveLength(3);
  expect(useDAWStore.getState().sections).toHaveLength(1);
});

test('does not duplicate empty sections', () => {
  useDAWStore.setState({
    sections: [{id: 'empty', name: 'Empty', startBeat: 20, lengthBeats: 4}],
    blocks: [block({startBeat: 0})],
  });

  expect(duplicateSectionOnce('empty')).toBe(false);
  expect(useDAWStore.getState().blocks).toHaveLength(1);
});

test('splits a section and clips crossing the split beat', () => {
  useDAWStore.setState({
    sections: [{id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 8}],
    blocks: [
      block({
        id: 'clip-midi',
        startBeat: 2,
        lengthBeats: 6,
        notes: [
          {note: 60, velocity: 90, startBeat: 0, lengthBeats: 1},
          {note: 62, velocity: 80, startBeat: 1.5, lengthBeats: 2},
          {note: 64, velocity: 70, startBeat: 4, lengthBeats: 1},
        ],
      }),
      block({
        id: 'clip-audio',
        type: 'audio',
        notes: undefined,
        startBeat: 0,
        lengthBeats: 8,
        audioFilePath: 'imports/vocal.wav',
        sourceLengthBeats: 12,
        sourceOffsetBeats: 2,
      }),
    ],
    playheadBeat: 4,
  });

  expect(splitSectionAtBeat('verse')).toBe(true);
  const state = useDAWStore.getState();
  expect(state.sections).toEqual([
    expect.objectContaining({id: 'verse', startBeat: 0, lengthBeats: 4}),
    expect.objectContaining({name: 'Verse Split', startBeat: 4, lengthBeats: 4}),
  ]);
  expect(state.blocks.find(item => item.id === 'clip-midi')).toMatchObject({
    startBeat: 2,
    lengthBeats: 2,
    notes: [
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 1},
      {note: 62, velocity: 80, startBeat: 1.5, lengthBeats: 0.5},
    ],
  });
  expect(state.blocks.find(item => item.id.startsWith('clip-midi-section'))).toMatchObject({
    startBeat: 4,
    lengthBeats: 4,
    notes: [
      {note: 62, velocity: 80, startBeat: 0, lengthBeats: 1.5},
      {note: 64, velocity: 70, startBeat: 2, lengthBeats: 1},
    ],
  });
  expect(state.blocks.find(item => item.id.startsWith('clip-audio-section'))).toMatchObject({
    startBeat: 4,
    lengthBeats: 4,
    audioFilePath: 'imports/vocal.wav',
    sourceOffsetBeats: 6,
  });
  expect(state.selectedBlockIds).toHaveLength(2);

  state.undo();
  expect(useDAWStore.getState().sections).toHaveLength(1);
  expect(useDAWStore.getState().blocks).toHaveLength(2);
});

test('does not split a section outside its range', () => {
  useDAWStore.setState({
    sections: [{id: 'verse', name: 'Verse', startBeat: 0, lengthBeats: 8}],
    blocks: [block({id: 'clip-midi', startBeat: 0, lengthBeats: 4})],
  });

  expect(splitSectionAtBeat('verse', 8)).toBe(false);
  expect(useDAWStore.getState().sections).toHaveLength(1);
  expect(useDAWStore.getState().blocks).toHaveLength(1);
});
