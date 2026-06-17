import {
  projectSnapshotSourcesChanged,
} from '../src/arrangement/projectSnapshot';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: 0,
    tracks: [],
    patterns: {},
    blocks: [],
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

describe('project snapshot source tracking', () => {
  beforeEach(resetStore);

  it('ignores store updates that are not persisted in project snapshots', () => {
    const previous = useDAWStore.getState();
    useDAWStore.setState({
      selectedBlockId: 'clip-1',
      selectedBlockIds: ['clip-1'],
      selectedTrackId: 'track-1',
      playheadSeconds: 4,
      playheadOwnedByUser: false,
      syncSource: 'engine',
      midiAudition: {trackId: 'track-1', source: 'keyboard'},
    });

    expect(projectSnapshotSourcesChanged(previous, useDAWStore.getState())).toBe(false);
  });

  it('detects store updates that change persisted project snapshots', () => {
    const previous = useDAWStore.getState();
    useDAWStore.setState({bpm: 132});

    expect(projectSnapshotSourcesChanged(previous, useDAWStore.getState())).toBe(true);
  });
});
