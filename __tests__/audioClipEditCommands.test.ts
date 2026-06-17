import {
  clampAudioClipGainDb,
  clampAudioFadeBeats,
  clampAudioSourceOffset,
  normalizeAudioClipGain,
  normalizedClipGainDb,
  nudgeAudioClipFade,
  nudgeAudioClipGainDb,
  nudgeAudioClipSlide,
  nudgeAudioClipSourceOffset,
  nudgeAudioClipTrimEnd,
  nudgeAudioClipTrimStart,
  toggleAudioClipReverse,
} from '../src/arrangement/audioClipEditCommands';
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

function audioBlock(updates?: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-audio',
    trackId: track.id,
    name: 'Vocal',
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#c45c26',
    sourceLengthBeats: 8,
    sourceOffsetBeats: 1,
    audioFilePath: 'imports/vocal.wav',
    absoluteAudioFilePath: '/tmp/imports/vocal.wav',
    ...updates,
  };
}

function resetStore(block: DAWBlock): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks: [block],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
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

describe('audio clip edit commands', () => {
  it('clamps source slip to the available audio source window', () => {
    const block = audioBlock();

    expect(clampAudioSourceOffset(block, -2)).toBe(0);
    expect(clampAudioSourceOffset(block, 10)).toBe(4);
  });

  it('clamps clip gain to the supported native range', () => {
    expect(clampAudioClipGainDb(-100)).toBe(-60);
    expect(clampAudioClipGainDb(48)).toBe(24);
  });

  it('computes normalize gain from native peak amplitude', () => {
    expect(normalizedClipGainDb(0.5)).toBeCloseTo(5.0206, 4);
    expect(normalizedClipGainDb(0)).toBeNull();
  });

  it('clamps fades so they cannot overlap past the clip length', () => {
    const block = audioBlock({fadeOutBeats: 1});

    expect(clampAudioFadeBeats(block, 'in', -1)).toBe(0);
    expect(clampAudioFadeBeats(block, 'in', 10)).toBe(3);
  });

  it('slips audio source offset and records undo history', () => {
    resetStore(audioBlock());

    expect(nudgeAudioClipSourceOffset('clip-audio', 10)).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.sourceOffsetBeats).toBe(4);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.sourceOffsetBeats).toBe(1);
  });

  it('trims audio clip start through the source window and records undo history', () => {
    resetStore(audioBlock({startBeat: 2}));

    expect(nudgeAudioClipTrimStart('clip-audio', 0.25)).toBe(true);
    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 2.25,
      lengthBeats: 3.75,
      sourceOffsetBeats: 1.25,
    });

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 2,
      lengthBeats: 4,
      sourceOffsetBeats: 1,
    });
  });

  it('trims and restores audio clip end within the available source window', () => {
    resetStore(audioBlock());

    expect(nudgeAudioClipTrimEnd('clip-audio', -0.25)).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.lengthBeats).toBe(3.75);

    expect(nudgeAudioClipTrimEnd('clip-audio', 10)).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.lengthBeats).toBe(7);
  });

  it('slides audio clip timing without changing source offset', () => {
    resetStore(audioBlock({startBeat: 2, sourceOffsetBeats: 1.5}));

    expect(nudgeAudioClipSlide('clip-audio', 0.25)).toBe(true);
    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 2.25,
      sourceOffsetBeats: 1.5,
    });

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]).toMatchObject({
      startBeat: 2,
      sourceOffsetBeats: 1.5,
    });
  });

  it('rejects no-op and non-audio source slip edits', () => {
    resetStore(audioBlock({sourceOffsetBeats: 4}));

    expect(nudgeAudioClipSourceOffset('clip-audio', 0.25)).toBe(false);
    expect(useDAWStore.getState().canUndo()).toBe(false);

    useDAWStore.setState({
      blocks: [audioBlock({type: 'midi', notes: []})],
    });

    expect(nudgeAudioClipSourceOffset('clip-audio', -0.25)).toBe(false);
  });

  it('nudges audio clip gain and records undo history', () => {
    resetStore(audioBlock({clipGainDb: -3}));

    expect(nudgeAudioClipGainDb('clip-audio', 2)).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBe(-1);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBe(-3);
  });

  it('normalizes audio clip gain and records undo history', () => {
    resetStore(audioBlock({sourcePeakAmplitude: 0.5}));

    expect(normalizeAudioClipGain('clip-audio')).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBeCloseTo(5.0206, 4);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.clipGainDb).toBeUndefined();
  });

  it('nudges audio fades and records undo history', () => {
    resetStore(audioBlock({fadeOutBeats: 1}));

    expect(nudgeAudioClipFade('clip-audio', 'in', 10)).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.fadeInBeats).toBe(3);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.fadeInBeats).toBeUndefined();
  });

  it('toggles audio reverse playback and records undo history', () => {
    resetStore(audioBlock());

    expect(toggleAudioClipReverse('clip-audio')).toBe(true);
    expect(useDAWStore.getState().blocks[0]?.isReversed).toBe(true);

    useDAWStore.getState().undo();

    expect(useDAWStore.getState().blocks[0]?.isReversed).toBeUndefined();
  });
});
