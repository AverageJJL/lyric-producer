import {
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  parseApcSourceFiles,
  serializeApcSource,
} from '../src/arrangement/apc';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {normalizeSnapshot} from '../src/arrangement/snapshotNormalize';
import {restoreProjectSnapshot} from '../src/arrangement/projectRestore';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
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

const TS = '2026-06-03T12:00:00.000Z';

describe('project document tempo and meter maps', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('persists map metadata through serialize, parse, and open', () => {
    useDAWStore.getState().setTempoMapEvent(8, 132, 'linear');
    useDAWStore.getState().setMeterMapEvent(12, {numerator: 7, denominator: 8});

    const files = serializeApcSource(decomposeSnapshotToApcSource(captureProjectSnapshot(), TS));
    const parsed = parseApcSourceFiles(files);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const compiled = compileApcSourceToSnapshot(parsed.source);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) {
      return;
    }

    resetStore();
    const restored = restoreProjectSnapshot(compiled.snapshot, {skipNativeRefresh: true});

    expect(restored.tempoMap).toEqual([
      {id: 'tempo-8_000', beat: 8, bpm: 132, ramp: 'linear'},
    ]);
    expect(restored.meterMap).toEqual([
      {id: 'meter-12_000', beat: 12, timeSignature: {numerator: 7, denominator: 8}},
    ]);
  });

  it('normalizes legacy snapshots that do not carry map metadata', () => {
    const legacy = {
      ...captureProjectSnapshot(),
      tempoMap: undefined,
      meterMap: undefined,
    };

    const normalized = normalizeSnapshot(legacy);

    expect(normalized.tempoMap).toEqual([]);
    expect(normalized.meterMap).toEqual([]);
  });
});
