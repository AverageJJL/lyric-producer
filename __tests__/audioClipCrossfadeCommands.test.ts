import {
  AUDIO_CROSSFADE_BEATS,
  canCrossfadeAudioClips,
  crossfadeSelectedAudioClips,
} from '../src/arrangement/audioClipCrossfadeCommands';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const track: DAWTrack = {
  id: 'track-audio',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: false,
  isLocked: false,
};

function audioBlock(id: string, startBeat: number, lengthBeats = 4): DAWBlock {
  return {
    id,
    trackId: track.id,
    name: id,
    startBeat,
    lengthBeats,
    type: 'audio',
    color: '#c45c26',
    sourceLengthBeats: 8,
    sourceOffsetBeats: 0,
    audioFilePath: `imports/${id}.wav`,
    absoluteAudioFilePath: `/tmp/imports/${id}.wav`,
  };
}

function resetStore(blocks: DAWBlock[], selectedBlockIds: string[]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks,
    selectedBlockId: selectedBlockIds[selectedBlockIds.length - 1] ?? null,
    selectedBlockIds,
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
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

describe('audio clip crossfade commands', () => {
  it('applies one undoable paired fade to adjacent selected audio clips', () => {
    resetStore([audioBlock('left', 0), audioBlock('right', 4)], ['left', 'right']);

    expect(canCrossfadeAudioClips(useDAWStore.getState().blocks, ['left', 'right'])).toBe(true);
    expect(crossfadeSelectedAudioClips()).toBe(true);

    const [left, right] = useDAWStore.getState().blocks;
    expect(left?.fadeOutBeats).toBe(AUDIO_CROSSFADE_BEATS);
    expect(right?.fadeInBeats).toBe(AUDIO_CROSSFADE_BEATS);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.fadeOutBeats).toBeUndefined();
    expect(useDAWStore.getState().blocks[1]?.fadeInBeats).toBeUndefined();
  });

  it('rejects separated selections without recording history', () => {
    resetStore([audioBlock('left', 0), audioBlock('right', 5)], ['left', 'right']);

    expect(canCrossfadeAudioClips(useDAWStore.getState().blocks, ['left', 'right'])).toBe(false);
    expect(crossfadeSelectedAudioClips()).toBe(false);
    expect(useDAWStore.getState().canUndo()).toBe(false);
  });
});
