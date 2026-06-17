import {
  copySelectedBlockToClipboard,
  cutSelectedBlockToClipboard,
  pasteClipboardToArrangement,
  resetClipboardForTests,
} from '../src/arrangement/clipClipboard';
import {BEATS_PER_BAR, type DrumPattern} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack, type TrackType} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

function track(id: string, type: TrackType): DAWTrack {
  return {
    id,
    name: id,
    isMuted: false,
    isSolo: false,
    type,
    instrumentId: type === 'drum_machine' ? 'drum_machine' : 'synth_lead',
    presetId: 'default',
    isRecordArmed: false,
    isLocked: false,
  };
}

function midi(id: string, trackId: string, startBeat: number): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
  };
}

function drumPattern(id: string): DrumPattern {
  return {
    id,
    name: id,
    steps: {
      kick: [true, ...Array.from({length: 15}, () => false)],
      snare: Array.from({length: 16}, () => false),
      hatClosed: Array.from({length: 16}, () => false),
      hatOpen: Array.from({length: 16}, () => false),
      tom1: Array.from({length: 16}, () => false),
      tom2: Array.from({length: 16}, () => false),
      perc: Array.from({length: 16}, () => false),
      clap: Array.from({length: 16}, () => false),
    },
  };
}

function resetStore(
  tracks: DAWTrack[],
  blocks: DAWBlock[],
  patterns: Record<string, DrumPattern> = {},
): void {
  resetArrangementHistoryForTests();
  resetClipboardForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks,
    patterns,
    blocks,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: tracks[0]?.id ?? null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 16,
    playheadSeconds: 8,
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

test('pastes selected MIDI and audio clips as one lane-relative group', () => {
  const tracks = [
    track('src-midi', 'software_instrument'),
    track('src-audio', 'voice_audio'),
    track('dst-midi', 'software_instrument'),
    track('dst-audio', 'voice_audio'),
  ];
  const audio: DAWBlock = {
    id: 'clip-audio',
    trackId: 'src-audio',
    name: 'Vocal',
    startBeat: 4,
    lengthBeats: 6,
    type: 'audio',
    color: '#d47f4a',
    audioFilePath: 'imports/vocal.wav',
    sourceLengthBeats: 12,
    sourceOffsetBeats: 2,
    fadeInBeats: 0.5,
    waveformPeaks: [0, 0.5, 0.25],
  };
  resetStore(tracks, [midi('clip-midi', 'src-midi', 0), audio]);
  useDAWStore.setState({
    selectedBlockId: 'clip-midi',
    selectedBlockIds: ['clip-midi', 'clip-audio'],
    selectedTrackId: 'src-midi',
  });

  expect(copySelectedBlockToClipboard()).toBe(true);
  useDAWStore.getState().selectTrack('dst-midi');
  expect(pasteClipboardToArrangement()).toBe(true);

  const state = useDAWStore.getState();
  const pasted = state.blocks.filter(block => block.id.startsWith('block-paste'));
  expect(pasted).toHaveLength(2);
  expect(pasted.find(block => block.type === 'midi')).toMatchObject({
    trackId: 'dst-midi',
    startBeat: 16,
  });
  expect(pasted.find(block => block.audioFilePath)).toMatchObject({
    trackId: 'dst-audio',
    startBeat: 20,
    audioFilePath: 'imports/vocal.wav',
    sourceOffsetBeats: 2,
    fadeInBeats: 0.5,
    waveformPeaks: [0, 0.5, 0.25],
  });
  expect(state.selectedTrackId).toBe('dst-midi');
  expect(state.selectedBlockIds).toHaveLength(2);
  expect(state.playheadBeat).toBe(26);

  state.undo();
  expect(useDAWStore.getState().blocks).toHaveLength(2);
});

test('cut removes every selected clipboard-compatible clip', () => {
  const tracks = [track('keys', 'software_instrument')];
  resetStore(tracks, [
    midi('clip-a', 'keys', 0),
    midi('clip-b', 'keys', 4),
    midi('clip-c', 'keys', 12),
  ]);
  useDAWStore.setState({
    selectedBlockId: 'clip-b',
    selectedBlockIds: ['clip-a', 'clip-b'],
    selectedTrackId: 'keys',
  });

  expect(cutSelectedBlockToClipboard()).toBe(true);
  expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual(['clip-c']);
  expect(pasteClipboardToArrangement()).toBe(true);
  expect(
    useDAWStore.getState().blocks.filter(block => block.id.startsWith('block-paste')),
  ).toHaveLength(2);
});

test('bulk drum paste clones pattern payloads independently from sources', () => {
  const tracks = [track('drums-a', 'drum_machine'), track('drums-b', 'drum_machine')];
  const patterns = {'pat-a': drumPattern('pat-a'), 'pat-b': drumPattern('pat-b')};
  resetStore(tracks, [
    {
      id: 'drum-a',
      trackId: 'drums-a',
      name: 'Beat A',
      startBeat: 0,
      lengthBeats: BEATS_PER_BAR,
      type: 'audio',
      color: '#c45c26',
      patternId: 'pat-a',
    },
    {
      id: 'drum-b',
      trackId: 'drums-a',
      name: 'Beat B',
      startBeat: 4,
      lengthBeats: BEATS_PER_BAR,
      type: 'audio',
      color: '#c45c26',
      patternId: 'pat-b',
    },
  ], patterns);
  useDAWStore.setState({
    selectedBlockId: 'drum-b',
    selectedBlockIds: ['drum-a', 'drum-b'],
    selectedTrackId: 'drums-a',
  });

  expect(copySelectedBlockToClipboard()).toBe(true);
  useDAWStore.getState().selectTrack('drums-b');
  expect(pasteClipboardToArrangement()).toBe(true);

  const pastedPatterns = useDAWStore.getState().blocks
    .filter(block => block.id.startsWith('block-paste'))
    .map(block => block.patternId!);
  expect(pastedPatterns).toHaveLength(2);
  expect(pastedPatterns).not.toContain('pat-a');
  expect(pastedPatterns).not.toContain('pat-b');

  useDAWStore.getState().patterns[pastedPatterns[0]!]!.steps.kick[0] = false;
  expect(useDAWStore.getState().patterns['pat-a']!.steps.kick[0]).toBe(true);
});
