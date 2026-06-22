import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {buildApcVirtualTree} from '../src/assistant/apcSourceTree';
import {acceptStagedEdit, resetCopilotStagingForTests, stageCopilotEdit} from '../src/assistant/copilotStaging';
import {stagedProposalFromPatch, summarizePatchChanges} from '../src/assistant/copilotProposedEdits';
import type {ApcPatchTransaction} from '../src/assistant/copilotPatchApply';
import {buildBlockStructureShortcut} from '../electron/copilotBuildShortcuts';
import {refreshPlaybackAndInstruments} from '../src/native/refreshPlayback';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetAudioStemStore(): void {
  const names = ['bass', 'drums', 'guitar', 'other', 'piano'];
  const tracks: DAWTrack[] = names.map((name, index) => ({
    id: `track-${index + 1}`,
    name: `Voice ${index + 1}`,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isMuted: false,
    isSolo: false,
    isRecordArmed: false,
    isLocked: false,
  }));
  const blocks: DAWBlock[] = names.map((name, index) => ({
    id: `clip-${index + 1}`,
    trackId: `track-${index + 1}`,
    name: `Midnight_Hoodie_${name}`,
    type: 'audio',
    color: '#4a7fd4',
    startBeat: 0,
    lengthBeats: 202.8,
    sourceLengthBeats: 202.8,
    sourceOffsetBeats: 0,
    audioFilePath: `imports/${name}.wav`,
    absoluteAudioFilePath: `/tmp/${name}.wav`,
    waveformPeaks: [0.1, 0.35, 0.2, 0.5, 0.15],
  }));
  resetCopilotStagingForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tracks,
    patterns: {},
    blocks,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

describe('summarizePatchChanges', () => {
  afterEach(() => {
    resetCopilotStagingForTests();
    jest.clearAllMocks();
  });

  it('groups large audio arrangement patches into readable musical operations', () => {
    const changes: ApcPatchTransaction['changes'] = [
      {op: 'mergeFields', path: 'timeline.json', beforeHash: 'h-timeline', fields: {sections: []}},
      {op: 'createFile', path: 'tracks/ai-build-slices-track-1.json', content: '{"name":"Build slices - Voice 1"}'},
      {op: 'deleteFile', path: 'tracks/track-1.json', beforeHash: 'h-track'},
      {op: 'deleteFile', path: 'clips/clip-1.json', beforeHash: 'h-clip'},
      ...Array.from({length: 9}, (_, index) => ({
        op: 'createFile' as const,
        path: `clips/build-slice-${index}.json`,
        content: `{"id":"build-slice-${index}","type":"audio","isMuted":false}`,
      })),
    ];

    expect(summarizePatchChanges(changes)).toEqual([
      'Update timeline sections',
      'Remove 1 original source track',
      'Remove 1 full-length source clip',
      'Create 1 Build slice lane',
      'Create 9 audible audio slice clips',
    ]);
  });

  it('stages audio track deletions without a full playback refresh', () => {
    resetAudioStemStore();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const result = buildBlockStructureShortcut('delete the piano', tree);

    expect(result).not.toBeNull();
    const proposal = stagedProposalFromPatch('D', result!.patch);
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) {
      throw new Error(proposal.error);
    }

    stageCopilotEdit(proposal.proposal.edits[0]!);
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();

    acceptStagedEdit();
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();
    expect(useDAWStore.getState().tracks.some(track => track.name === 'Voice 5')).toBe(false);
  });

  it('stages the local audio split build as audible slices without throwing', () => {
    resetAudioStemStore();
    const tree = buildApcVirtualTree(captureProjectSnapshot());
    const result = buildBlockStructureShortcut(
      'Make the hook feel bigger without adding new music. Use mutes, clip splits, and gain changes only.',
      tree,
    );

    expect(result).not.toBeNull();
    const proposal = stagedProposalFromPatch('P', result!.patch);
    expect(proposal.ok).toBe(true);
    if (!proposal.ok) {
      throw new Error(proposal.error);
    }

    stageCopilotEdit(proposal.proposal.edits[0]!);
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();

    const state = useDAWStore.getState();
    expect(state.tracks.filter(track => track.name.startsWith('Build slices - '))).toHaveLength(5);
    const pendingSourceTracks = state.tracks.filter(track => /^Voice \d+$/.test(track.name));
    expect(pendingSourceTracks).toHaveLength(5);
    expect(pendingSourceTracks.every(track => track.pendingDeletion === true && track.isMuted)).toBe(true);
    const buildBlocks = state.blocks.filter(block => block.id.startsWith('build-'));
    const expectedBuildBlockCount = result!.patch.changes.filter(change =>
      change.op === 'createFile' && change.path.startsWith('clips/'),
    ).length;
    expect(buildBlocks).toHaveLength(expectedBuildBlockCount);
    expect(buildBlocks.every(block => block.isMuted === false)).toBe(true);
    expect(buildBlocks.every(block => block.waveformPeaks?.length === 5)).toBe(true);
    expect(buildBlocks.every(block => typeof block.absoluteAudioFilePath === 'string')).toBe(true);

    acceptStagedEdit();
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();

    const accepted = useDAWStore.getState();
    expect(accepted.tracks.filter(track => /^Voice \d+$/.test(track.name))).toHaveLength(0);
    expect(accepted.tracks.filter(track => track.name.startsWith('Build slices - '))).toHaveLength(5);
  });
});
