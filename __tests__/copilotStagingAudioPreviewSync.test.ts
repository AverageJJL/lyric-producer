import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {
  resetCopilotStagingForTests,
  stageCopilotEdit,
} from '../src/assistant/copilotStaging';
import {stagedEditFromSnapshot} from '../src/assistant/copilotStagedEdit';

function audioTrack(id: string, name: string): DAWTrack {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isRecordArmed: false,
    isLocked: false,
  };
}

function audioBlock(id: string, trackId: string, startBeat: number, lengthBeats: number): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat,
    lengthBeats,
    type: 'audio',
    color: '#5a8cff',
    audioFilePath: 'imports/source.wav',
    absoluteAudioFilePath: '/tmp/source.wav',
    sourceLengthBeats: 64,
    sourceOffsetBeats: startBeat,
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  resetCopilotStagingForTests();
  useDAWStore.setState({
    isPlaying: false, bpm: 120, tracks: [], patterns: {}, blocks: [],
    selectedBlockId: null, selectedBlockIds: [], selectedTrackId: null,
    playheadBeat: 0, playheadSeconds: 0, syncSource: 'ui', snapGrid: DEFAULT_SNAP_GRID,
    masterVolumeDb: 0, masterPan: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE}, scale: null, chord: null, sections: [],
    liveMidiPreviewByTrack: {}, liveAudioPreviewByClip: {},
  });
}

describe('copilot staging audio preview sync', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('batches file-backed build slices immediately when staging a preview', () => {
    const sendCommand = jest.fn(() => '{"ok":true}');
    const sendCommandAsync = jest.fn(() => Promise.resolve('{"ok":true}'));
    const sourceTrack = audioTrack('source-track', 'Source');
    const sourceBlock = audioBlock('source-clip', 'source-track', 0, 64);
    window.audioEngine = {sendCommand, sendCommandAsync};
    useDAWStore.setState({tracks: [sourceTrack], blocks: [sourceBlock]});

    const base = captureProjectSnapshot();
    const buildTrack = audioTrack('build-track', 'Build slices - Source');
    const buildBlocks = Array.from({length: 4}, (_, index) =>
      audioBlock(`build-${index + 1}`, buildTrack.id, index * 8, 8),
    );
    const preview = stagedEditFromSnapshot(
      {id: 'audio-preview', proposalId: 'A', label: 'slice', summary: []},
      {
        ...base,
        tracks: [
          {...sourceTrack, isMuted: true, isDisabled: true, pendingDeletion: true},
          buildTrack,
        ],
        blocks: [...buildBlocks, {...sourceBlock, isMuted: true, pendingDeletion: true}],
      },
      {skipPlaybackRefresh: true},
    );

    stageCopilotEdit(preview);

    const batchCall = sendCommandAsync.mock.calls.find(([command]) =>
      command === 'upsert_audio_clips_batch',
    );
    expect(batchCall).toBeDefined();
    expect(JSON.parse(batchCall![1])).toMatchObject({
      clips: [expect.objectContaining({
        clipId: 'build-1__playback_4',
        startBeat: 0,
        lengthBeats: 32,
        sourceOffsetBeats: 0,
      })],
    });
    expect(sendCommandAsync.mock.calls.map(([command]) => command))
      .not.toContain('upsert_audio_clip');
    expect(sendCommand).toHaveBeenCalledWith(
      'delete_clip',
      JSON.stringify({clipId: 'source-clip'}),
    );
  });
});
