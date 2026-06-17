import {applyArrangementOperations} from '../src/arrangement/operations';
import {
  createProjectDocument,
  openProjectDocument,
} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
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

describe('project document FX restore', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('restores persisted FX state through the native command bridge', () => {
    applyArrangementOperations([{op: 'createTrack', templateId: 'voice_audio'}], {
      skipNativeRefresh: true,
    });
    const snapshot = captureProjectSnapshot();
    const trackId = snapshot.tracks.find(track => track.type === 'voice_audio')!.id;
    snapshot.fxStates = [{
      trackId,
      slots: [{
        slot: 'eq',
        enabled: true,
        params: {pluginId: 'airwindows:Parametric', values: {treble: 0.8, dryWet: 1}},
      }],
      pluginChain: [{
        slot: 'eq',
        pluginId: 'airwindows:Parametric',
        displayName: 'Parametric',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: false,
        order: 0,
        status: 'available',
      }],
    }];
    snapshot.ampSimStates = [{
      trackId,
      enabled: true,
      inputMode: 'guitar_di',
      monitoring: false,
      pedals: [{id: 'drive', type: 'overdrive', enabled: true, params: {drive: 0.6}}],
      cabinet: {enabled: true, irId: 'guitar_us_2x12', mix: 1},
    }];
    snapshot.fxSummaries = [];
    const sendCommand = jest.fn((command: string, payload: string) =>
      JSON.stringify({ok: true, data: JSON.parse(payload)}),
    );
    window.audioEngine = {sendCommand};

    openProjectDocument(createProjectDocument(snapshot, '2026-06-02T12:00:00.000Z'));

    expect(sendCommand).toHaveBeenCalledWith(
      'set_amp_sim',
      expect.stringContaining('"trackId":"' + trackId + '"'),
    );
    expect(sendCommand).toHaveBeenCalledWith(
      'set_track_fx',
      expect.stringContaining('"trackId":"' + trackId + '"'),
    );
    const fxPayload = JSON.parse(
      sendCommand.mock.calls.find(([command]) => command === 'set_track_fx')?.[1] ?? '{}',
    );
    expect(fxPayload.pluginChain.map((slot: {slot: string}) => slot.slot)).toEqual([
      'eq',
      'compressor',
      'reverb',
    ]);
  });

  it('preserves external plugin-chain metadata during project restore', () => {
    applyArrangementOperations([{op: 'createTrack', templateId: 'voice_audio'}], {
      skipNativeRefresh: true,
    });
    const snapshot = captureProjectSnapshot();
    const trackId = snapshot.tracks.find(track => track.type === 'voice_audio')!.id;
    snapshot.fxStates = [{
      trackId,
      slots: [],
      pluginChain: [{
        slot: 'compressor',
        pluginId: 'external_vst3:/plugins/Shape.vst3',
        displayName: 'Shape',
        format: 'external_vst3',
        enabled: true,
        bypassed: false,
        order: 0,
        status: 'available',
      }],
    }];
    snapshot.fxSummaries = [];
    const sendCommand = jest.fn((command: string, payload: string) =>
      JSON.stringify({ok: true, data: JSON.parse(payload)}),
    );
    window.audioEngine = {sendCommand};

    openProjectDocument(createProjectDocument(snapshot, '2026-06-02T12:00:00.000Z'));

    const fxPayload = JSON.parse(
      sendCommand.mock.calls.find(([command]) => command === 'set_track_fx')?.[1] ?? '{}',
    );
    expect(fxPayload.pluginChain.find((slot: {slot: string}) => slot.slot === 'compressor')).toMatchObject({
      pluginId: 'external_vst3:/plugins/Shape.vst3',
      displayName: 'Shape',
      format: 'external_vst3',
      enabled: true,
      bypassed: false,
      status: 'available',
    });
  });
});
