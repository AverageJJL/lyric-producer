import {captureProjectSnapshot, type ProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {canUndoArrangement, resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {
  acceptStagedEdit,
  resetCopilotStagingForTests,
  revertStagedEdit,
  stageCopilotEdit,
} from '../src/assistant/copilotStaging';
import {isCopilotStagePending, useCopilotStagingStore} from '../src/assistant/copilotStagingStore';
import {stagedEditFromSnapshot} from '../src/assistant/copilotStagedEdit';
import {refreshPlaybackAndInstruments} from '../src/native/refreshPlayback';
import {
  resetCopilotChatHistoryForTests,
  useCopilotChatHistoryStore,
} from '../src/assistant/copilotChatHistory';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  resetCopilotStagingForTests();
  resetCopilotChatHistoryForTests();
  useDAWStore.setState({
    isPlaying: false, bpm: 120, tracks: [], patterns: {}, blocks: [],
    selectedBlockId: null, selectedBlockIds: [], selectedTrackId: null,
    playheadBeat: 0, playheadSeconds: 0, syncSource: 'ui', snapGrid: DEFAULT_SNAP_GRID,
    masterVolumeDb: 0, masterPan: 0,
    timeSignature: {...DEFAULT_TIME_SIGNATURE}, scale: null, chord: null, sections: [],
    liveMidiPreviewByTrack: {}, liveAudioPreviewByClip: {},
  });
}

function snapshotWithBpm(base: ProjectSnapshot, bpm: number): ProjectSnapshot {
  return {...base, bpm};
}

function edit(id: string, proposalId: string, snapshot: ProjectSnapshot) {
  return stagedEditFromSnapshot({id, proposalId, label: `bpm ${snapshot.bpm}`, summary: []}, snapshot);
}

describe('copilot staging engine', () => {
  beforeEach(() => {
    resetStore();
    jest.clearAllMocks();
    window.audioEngine = undefined;
  });

  it('stages an edit into the live workspace and flags pending', () => {
    const base = captureProjectSnapshot();
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    expect(useDAWStore.getState().bpm).toBe(140);
    expect(useCopilotStagingStore.getState().stagePending).toBe(true);
    expect(useCopilotStagingStore.getState().activeStagedEditId).toBe('e1');
  });

  it('flags pending BEFORE mutating the store, so a preview is never seen as un-staged dirty', () => {
    const base = captureProjectSnapshot();
    let pendingAtFirstMutation: boolean | null = null;
    const unsubscribe = useDAWStore.subscribe(() => {
      if (pendingAtFirstMutation === null) {
        pendingAtFirstMutation = isCopilotStagePending();
      }
    });
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    unsubscribe();
    // The dirty-tracking subscriber runs synchronously on this mutation; it must already
    // see the stage as pending (else it would autosave the un-accepted preview).
    expect(pendingAtFirstMutation).toBe(true);
  });

  it('revert restores the exact pre-stage state and clears pending', () => {
    const base = captureProjectSnapshot();
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    revertStagedEdit();
    expect(useDAWStore.getState().bpm).toBe(120);
    expect(useCopilotStagingStore.getState().stagePending).toBe(false);
    expect(useCopilotStagingStore.getState().activeStagedEditId).toBeNull();
  });

  it('accept keeps the staged state and records exactly one undo checkpoint', () => {
    const base = captureProjectSnapshot();
    expect(canUndoArrangement()).toBe(false);
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    acceptStagedEdit();
    expect(useDAWStore.getState().bpm).toBe(140);
    expect(useCopilotStagingStore.getState().stagePending).toBe(false);
    expect(canUndoArrangement()).toBe(true);
  });

  it('swaps between options in one proposal against the same base', () => {
    const base = captureProjectSnapshot();
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    expect(useDAWStore.getState().bpm).toBe(140);
    stageCopilotEdit(edit('e2', 'P', snapshotWithBpm(base, 160)));
    expect(useDAWStore.getState().bpm).toBe(160);
    expect(useCopilotStagingStore.getState().activeStagedEditId).toBe('e2');
    revertStagedEdit();
    expect(useDAWStore.getState().bpm).toBe(120); // back to the ORIGINAL base, not 140
  });

  it('re-bases when staging a different proposal after an accept', () => {
    const base = captureProjectSnapshot();
    stageCopilotEdit(edit('e1', 'P', snapshotWithBpm(base, 140)));
    acceptStagedEdit(); // 140 committed
    const committed = captureProjectSnapshot();
    stageCopilotEdit(edit('e3', 'Q', snapshotWithBpm(committed, 160)));
    expect(useDAWStore.getState().bpm).toBe(160);
    revertStagedEdit();
    expect(useDAWStore.getState().bpm).toBe(140); // reverts to the committed base, not 120
  });

  it('does not rewind Copilot chat when staging a snapshot proposal', () => {
    const chat = useCopilotChatHistoryStore.getState();
    const sessionId = chat.activeSessionId;
    chat.appendMessage(sessionId, {id: 'user-1', role: 'user', content: 'Try a faster chorus'});
    const proposalSnapshot = snapshotWithBpm(captureProjectSnapshot(), 150);
    chat.appendMessage(sessionId, {id: 'assistant-1', role: 'assistant', content: 'I proposed a tempo lift.'});

    stageCopilotEdit(edit('e4', 'R', proposalSnapshot));

    const liveMessages = useCopilotChatHistoryStore.getState().sessions
      .find(session => session.id === sessionId)?.messages.map(message => message.content);
    expect(liveMessages).toEqual(['Try a faster chorus', 'I proposed a tempo lift.']);
  });

  it('skips native refresh for visual audio snapshot previews', () => {
    const base = captureProjectSnapshot();
    const preview = stagedEditFromSnapshot(
      {id: 'audio-preview', proposalId: 'A', label: 'audio guide', summary: []},
      snapshotWithBpm(base, 140),
      {previewSkipsNativeSync: true},
    );

    stageCopilotEdit(preview);
    expect(useDAWStore.getState().bpm).toBe(140);
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();

    revertStagedEdit();
    expect(useDAWStore.getState().bpm).toBe(120);
    expect(refreshPlaybackAndInstruments).not.toHaveBeenCalled();
  });

  it('removes pending audio preview clips from native playback on stage and reject', () => {
    const sendCommand = jest.fn(() => '{"ok":true}');
    const sendCommandAsync = jest.fn(() => Promise.resolve('{"ok":true}'));
    window.audioEngine = {sendCommand, sendCommandAsync};
    useDAWStore.setState({
      tracks: [{
        id: 'source-track',
        name: 'Source',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      }],
      blocks: [{
        id: 'source-clip',
        trackId: 'source-track',
        name: 'Source clip',
        startBeat: 0,
        lengthBeats: 64,
        type: 'audio',
        color: '#4a7fd4',
        audioFilePath: 'imports/source.wav',
        absoluteAudioFilePath: '/tmp/source.wav',
        sourceLengthBeats: 64,
        sourceOffsetBeats: 0,
      }],
    });
    const base = captureProjectSnapshot();
    const preview = stagedEditFromSnapshot(
      {id: 'audio-preview', proposalId: 'A', label: 'audio guide', summary: []},
      {
        ...base,
        tracks: [
          {...base.tracks[0]!, isMuted: true, isDisabled: true, pendingDeletion: true},
          {
            ...base.tracks[0]!,
            id: 'build-track',
            name: 'Build slices - Source',
            isMuted: false,
            isDisabled: false,
            pendingDeletion: undefined,
          },
        ],
        blocks: [
          {
            ...base.blocks[0]!,
            id: 'build-clip',
            trackId: 'build-track',
            name: 'Intro - Source',
            lengthBeats: 8,
            sourceLengthBeats: 64,
          },
          {...base.blocks[0]!, isMuted: true, pendingDeletion: true},
        ],
      },
      {skipPlaybackRefresh: true, acceptSnapshot: {...base, tracks: [], blocks: []}},
    );

    stageCopilotEdit(preview);
    expect(sendCommand).toHaveBeenCalledWith('delete_clip', JSON.stringify({clipId: 'source-clip'}));

    revertStagedEdit();
    expect(sendCommand).toHaveBeenCalledWith('delete_clip', JSON.stringify({clipId: 'build-clip'}));
    expect(sendCommandAsync).toHaveBeenCalledWith(
      'upsert_audio_clip',
      expect.stringContaining('"clipId":"source-clip"'),
    );
  });

  it('cancels in-place audio preview edits on reject', () => {
    const sendCommand = jest.fn(() => '{"ok":true}');
    const sendCommandAsync = jest.fn(() => Promise.resolve('{"ok":true}'));
    window.audioEngine = {sendCommand, sendCommandAsync};
    useDAWStore.setState({
      tracks: [{
        id: 'source-track',
        name: 'Source',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      }],
      blocks: [{
        id: 'source-clip',
        trackId: 'source-track',
        name: 'Source clip',
        startBeat: 0,
        lengthBeats: 64,
        type: 'audio',
        color: '#4a7fd4',
        audioFilePath: 'imports/source.wav',
        absoluteAudioFilePath: '/tmp/source.wav',
        sourceLengthBeats: 64,
        sourceOffsetBeats: 0,
      }],
    });
    const base = captureProjectSnapshot();
    const preview = stagedEditFromSnapshot(
      {id: 'trim-preview', proposalId: 'B', label: 'trim', summary: []},
      {
        ...base,
        blocks: [{...base.blocks[0]!, lengthBeats: 8}],
      },
      {skipPlaybackRefresh: true},
    );

    stageCopilotEdit(preview);
    revertStagedEdit();

    expect(sendCommand).toHaveBeenCalledWith('delete_clip', JSON.stringify({clipId: 'source-clip'}));
    expect(sendCommandAsync).toHaveBeenCalledWith(
      'upsert_audio_clip',
      expect.stringContaining('"lengthBeats":64'),
    );
  });
});
