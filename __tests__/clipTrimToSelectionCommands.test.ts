import {
  trimSelectedClipsToCycleRange,
} from '../src/arrangement/clipEditCommands';
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
    isRelativeSnapEnabled: false,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
  });
}

function midiBlock(updates?: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-midi',
    trackId: track.id,
    name: 'Lead',
    startBeat: 0,
    lengthBeats: 8,
    type: 'midi',
    color: '#4a7fd4',
    notes: [
      {note: 60, velocity: 90, startBeat: 2, lengthBeats: 2},
      {note: 64, velocity: 80, startBeat: 6, lengthBeats: 2},
    ],
    ...updates,
  };
}

describe('trim selected clips to cycle range', () => {
  it('trims selected MIDI and audio clips with one undo step', () => {
    resetStore([
      midiBlock(),
      midiBlock({
        id: 'clip-audio',
        type: 'audio',
        notes: undefined,
        startBeat: 2,
        lengthBeats: 8,
        sourceLengthBeats: 12,
        sourceOffsetBeats: 1,
      }),
    ]);
    useDAWStore.setState({
      isCycleEnabled: true,
      cycleStartBeat: 3,
      cycleEndBeat: 7,
      selectedBlockId: 'clip-audio',
      selectedBlockIds: ['clip-midi', 'clip-audio'],
    });

    expect(trimSelectedClipsToCycleRange()).toBe(true);

    const [midi, audio] = useDAWStore.getState().blocks;
    expect(midi).toMatchObject({startBeat: 3, lengthBeats: 4});
    expect(midi?.notes).toEqual([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 1},
      {note: 64, velocity: 80, startBeat: 3, lengthBeats: 1},
    ]);
    expect(audio).toMatchObject({startBeat: 3, lengthBeats: 4, sourceOffsetBeats: 2});

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks[0]).toMatchObject({startBeat: 0, lengthBeats: 8});
    expect(useDAWStore.getState().blocks[1]).toMatchObject({
      startBeat: 2,
      lengthBeats: 8,
      sourceOffsetBeats: 1,
    });
  });

  it('does nothing when cycle mode is disabled', () => {
    resetStore([midiBlock()]);

    expect(trimSelectedClipsToCycleRange()).toBe(false);
    expect(useDAWStore.getState().blocks[0]).toMatchObject({startBeat: 0, lengthBeats: 8});
    expect(useDAWStore.getState().canUndo()).toBe(false);
  });
});
