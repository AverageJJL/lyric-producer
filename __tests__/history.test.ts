import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

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

describe('arrangement undo/redo', () => {
  beforeEach(() => {
    resetStore();
  });

  it('undoes clip move and restores prior position', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: trackId!,
          name: 'Test',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
    });

    useDAWStore.getState().moveBlock('clip-1', 8);
    expect(useDAWStore.getState().blocks[0]?.startBeat).toBe(8);

    expect(useDAWStore.getState().canUndo()).toBe(true);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks[0]?.startBeat).toBe(0);
    expect(useDAWStore.getState().canRedo()).toBe(true);

    useDAWStore.getState().redo();
    expect(useDAWStore.getState().blocks[0]?.startBeat).toBe(8);
  });

  it('skips history for no-op clip move and resize', () => {
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: 'track-1',
          name: 'Test',
          startBeat: 4,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
    });

    useDAWStore.getState().moveBlock('clip-1', 4, 'track-1');
    expect(useDAWStore.getState().canUndo()).toBe(false);

    useDAWStore.getState().resizeBlock('clip-1', 4, 4);
    expect(useDAWStore.getState().canUndo()).toBe(false);

    useDAWStore.getState().resizeBlock('clip-1', 4, 8);
    expect(useDAWStore.getState().canUndo()).toBe(true);
  });

  it('skips history for missing drum-pattern step edits', () => {
    useDAWStore.getState().toggleDrumStep('missing-pattern', 'kick', 0);
    expect(useDAWStore.getState().canUndo()).toBe(false);
  });

  it('undoes BPM change', () => {
    useDAWStore.getState().setBpm(140);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().bpm).toBe(120);
  });

  it('undoes visible track state changes', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;

    useDAWStore.getState().toggleTrackMute(trackId);
    expect(useDAWStore.getState().tracks[0]?.isMuted).toBe(true);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.isMuted).toBe(false);

    useDAWStore.getState().toggleTrackSolo(trackId);
    expect(useDAWStore.getState().tracks[0]?.isSolo).toBe(true);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.isSolo).toBe(false);

    useDAWStore.getState().toggleTrackRecordArm(trackId);
    expect(useDAWStore.getState().tracks[0]?.isRecordArmed).toBe(true);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.isRecordArmed).toBe(false);
  });

  it('undoes clip rename and note edits', () => {
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: 'track-1',
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
        },
      ],
    });

    useDAWStore.getState().updateBlock('clip-1', {name: 'Hook'});
    expect(useDAWStore.getState().blocks[0]?.name).toBe('Hook');
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks[0]?.name).toBe('Lead');

    useDAWStore.getState().updateNoteInBlock('clip-1', 0, {velocity: 40});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.velocity).toBe(40);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.velocity).toBe(90);
  });

  it('undoes project metadata changes and skips metadata no-ops', () => {
    useDAWStore.getState().setTimeSignature({...DEFAULT_TIME_SIGNATURE});
    expect(useDAWStore.getState().canUndo()).toBe(false);

    useDAWStore.getState().setScale({root: 'D', mode: 'minor'});
    expect(useDAWStore.getState().scale).toEqual({root: 'D', mode: 'minor'});
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().scale).toBeNull();
  });

  it('undoes cycle locator changes', () => {
    useDAWStore.getState().setCycleRange(4, 12, {enable: true});
    expect(useDAWStore.getState()).toMatchObject({
      isCycleEnabled: true,
      cycleStartBeat: 4,
      cycleEndBeat: 12,
    });

    useDAWStore.getState().undo();
    expect(useDAWStore.getState()).toMatchObject({
      isCycleEnabled: false,
      cycleStartBeat: 0,
      cycleEndBeat: 4,
    });
  });

  it('undoes looper performance mode changes', () => {
    useDAWStore.getState().setPerformanceMode('looper');
    expect(useDAWStore.getState().performanceMode).toBe('looper');
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().performanceMode).toBe('linear');

    useDAWStore.getState().setLooperLengthBars(8);
    expect(useDAWStore.getState().looperLengthBars).toBe(8);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().looperLengthBars).toBe(4);
  });

  it('does not record selection changes in history', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    useDAWStore.getState().selectTrack(useDAWStore.getState().tracks[0]!.id);
    expect(useDAWStore.getState().canUndo()).toBe(true);
    const undoCountBefore = useDAWStore.getState().canUndo();
    useDAWStore.getState().selectBlock(null);
    expect(useDAWStore.getState().canUndo()).toBe(undoCountBefore);
  });
});
