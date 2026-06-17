import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';

function audioBlock(id: string, trackId = 'track-audio'): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#64a5ff',
    audioFilePath: 'imports/shared.wav',
    absoluteAudioFilePath: '/tmp/assets/imports/shared.wav',
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [{
      id: 'track-audio',
      name: 'Audio',
      isMuted: false,
      isSolo: false,
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isRecordArmed: false,
      isLocked: false,
    }],
    patterns: {},
    blocks: [audioBlock('clip-a'), audioBlock('clip-b')],
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    performanceMode: 'linear',
    looperLengthBars: 4,
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

describe('media source management', () => {
  beforeEach(resetStore);

  it('renames every clip sharing a media source and records undo history', () => {
    useDAWStore.getState().setMediaSourceName('clip-a', 'Lead Vocal Stem');

    expect(useDAWStore.getState().blocks.map(block => block.mediaSourceName))
      .toEqual(['Lead Vocal Stem', 'Lead Vocal Stem']);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks.map(block => block.mediaSourceName))
      .toEqual([undefined, undefined]);
  });

  it('uses source aliases in project media references', () => {
    useDAWStore.getState().setMediaSourceName('clip-a', 'Lead Vocal Stem');

    expect(captureProjectSnapshot().mediaReferences[0]).toMatchObject({
      clipId: 'clip-a',
      name: 'Lead Vocal Stem',
      relativePath: 'imports/shared.wav',
    });
  });

  it('matches shared media by absolute path when relative paths differ', () => {
    useDAWStore.setState(state => ({
      blocks: [
        state.blocks[0]!,
        {
          ...state.blocks[1]!,
          audioFilePath: 'imports/alternate-reference.wav',
        },
      ],
    }));

    useDAWStore.getState().setMediaSourceName('clip-a', 'Shared Absolute Source');

    expect(useDAWStore.getState().blocks.map(block => block.mediaSourceName))
      .toEqual(['Shared Absolute Source', 'Shared Absolute Source']);
  });

  it('replaces multiple audio block sources in one undoable mutation', () => {
    useDAWStore.getState().replaceAudioBlocksMedia([
      {
        blockId: 'clip-a',
        media: {
          audioFilePath: 'imports/clip-a-copy.wav',
          absoluteAudioFilePath: '/tmp/assets/imports/clip-a-copy.wav',
          mediaSourceName: 'Clip A Copy',
          lengthBeats: 8,
        },
      },
      {
        blockId: 'clip-b',
        media: {
          audioFilePath: 'imports/clip-b-copy.wav',
          absoluteAudioFilePath: '/tmp/assets/imports/clip-b-copy.wav',
          mediaSourceName: 'Clip B Copy',
          lengthBeats: 6,
        },
      },
    ]);

    expect(useDAWStore.getState().blocks.map(block => block.audioFilePath))
      .toEqual(['imports/clip-a-copy.wav', 'imports/clip-b-copy.wav']);
    expect(useDAWStore.getState().blocks.map(block => block.mediaSourceName))
      .toEqual(['Clip A Copy', 'Clip B Copy']);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks.map(block => block.audioFilePath))
      .toEqual(['imports/shared.wav', 'imports/shared.wav']);
  });
});
