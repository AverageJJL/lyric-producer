import {
  applyArrangementOperations,
  operationsFromSnapshot,
} from '../src/arrangement/operations';
import {
  captureProjectSnapshot,
  emptyProjectSnapshot,
  snapshotFingerprint,
} from '../src/arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../src/arrangement/projectRestore';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
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

describe('project snapshot round-trip', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('replay via applyArrangementOperations yields identical fingerprint', () => {
    applyArrangementOperations(
      [
        {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
        {op: 'createTrack', templateId: 'drum_machine'},
        {op: 'setBpm', bpm: 128},
        {op: 'setMasterMix', volumeDb: -7, pan: -0.35},
        {op: 'setSnapGrid', snapGrid: '1/32'},
        {op: 'setRelativeSnap', enabled: true},
        {op: 'setPerformanceMode', mode: 'looper', looperLengthBars: 8},
        {op: 'setCycle', enabled: true, startBeat: 4, endBeat: 12},
        {op: 'setTimeSignature', timeSignature: {numerator: 3, denominator: 4}},
        {op: 'setScale', scale: {root: 'C', mode: 'major'}},
        {op: 'setChord', chord: {symbol: 'Am7'}},
        {
          op: 'setSections',
          sections: [{id: 'sec-1', name: 'Verse', startBeat: 0, lengthBeats: 16}],
        },
      ],
      {skipNativeRefresh: true},
    );

    const drumTrackId = useDAWStore.getState().tracks.find(t => t.type === 'drum_machine')?.id;
    const synthTrackId = useDAWStore.getState().tracks.find(t => t.type === 'software_instrument')?.id;
    expect(drumTrackId).toBeDefined();
    expect(synthTrackId).toBeDefined();

    const pattern = createEmptyPattern('Pattern A', 'pat-roundtrip');
    pattern.steps.kick[0] = true;
    pattern.steps.snare[4] = true;

    applyArrangementOperations(
      [
        {op: 'upsertDrumPattern', pattern},
        {
          op: 'upsertDrumClip',
          clip: {
            id: 'clip-drums',
            trackId: drumTrackId!,
            name: 'Pattern A',
            startBeat: 0,
            lengthBeats: 8,
            patternId: 'pat-roundtrip',
          },
        },
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-midi',
            trackId: synthTrackId!,
            name: 'Lead',
            startBeat: 4,
            lengthBeats: 4,
            notes: [{note: 64, velocity: 90, startBeat: 0, lengthBeats: 1}],
          },
        },
        {op: 'setTrackLocked', trackId: synthTrackId!, isLocked: true},
      ],
      {skipNativeRefresh: true},
    );

    const original = captureProjectSnapshot();
    expect(original.isRelativeSnapEnabled).toBe(true);
    expect(original).toMatchObject({performanceMode: 'looper', looperLengthBars: 8});
    expect(original).toMatchObject({isCycleEnabled: true, cycleStartBeat: 4, cycleEndBeat: 12});
    const fingerprint = snapshotFingerprint(original);

    resetStore();

    applyArrangementOperations(operationsFromSnapshot(original), {skipNativeRefresh: true});

    const replayed = captureProjectSnapshot();
    expect(snapshotFingerprint(replayed)).toBe(fingerprint);
  });

  it('falls back to empty FX summaries when native FX is unavailable', () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );

    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();
    const snapshot = captureProjectSnapshot();
    expect(snapshot.fxSummaries[0]).toMatchObject({
      trackId,
      enabledSlots: [],
      plugins: {
        eq: 'airwindows:Parametric',
        compressor: 'airwindows:Logical4',
        reverb: 'airwindows:MatrixVerb',
      },
    });
    expect(snapshot.fxSummaries[0]?.pluginChain.map(slot => slot.slot)).toEqual(['eq', 'compressor', 'reverb']);
    expect(snapshot.fxStates[0]?.trackId).toBe(trackId);
  });

  it('persists recording lead-in preferences through capture and restore', () => {
    useDAWStore.getState().setRecordingCountInBeats(8);
    useDAWStore.getState().setRecordingPreRollBeats(4);
    useDAWStore.getState().setPunchRecordingEnabled(true);
    useDAWStore.getState().setLoopRecordingEnabled(true);
    useDAWStore.getState().setRecordingLatencyCompensationMs(50);

    const snapshot = captureProjectSnapshot();
    expect(snapshot.recordingCountInBeats).toBe(8);
    expect(snapshot.recordingPreRollBeats).toBe(4);
    expect(snapshot.isPunchRecordingEnabled).toBe(true);
    expect(snapshot.isLoopRecordingEnabled).toBe(true);
    expect(snapshot.recordingLatencyCompensationMs).toBe(50);

    const restored = restoreProjectSnapshot(
      {
        ...emptyProjectSnapshot(),
        recordingCountInBeats: 4,
        recordingPreRollBeats: 8,
        isPunchRecordingEnabled: true,
        isLoopRecordingEnabled: true,
        recordingLatencyCompensationMs: -1,
      },
      {skipNativeRefresh: true},
    );

    expect(restored.recordingCountInBeats).toBe(4);
    expect(restored.recordingPreRollBeats).toBe(8);
    expect(restored.isPunchRecordingEnabled).toBe(true);
    expect(restored.isLoopRecordingEnabled).toBe(true);
    expect(restored.recordingLatencyCompensationMs).toBe(-1);
  });

  it('captures full FX state and audio media references for project persistence', () => {
    const sendCommand = jest.fn((command: string) => {
      if (command === 'get_track_fx') {
        return JSON.stringify({
          ok: true,
          data: {
            trackId: 'track-a',
            slots: [
              {
                slot: 'eq',
                enabled: true,
                params: {
                  pluginId: 'airwindows:Parametric',
                  values: {treble: 0.7, dryWet: 1},
                },
              },
            ],
          },
        });
      }
      if (command === 'get_amp_sim') {
        return JSON.stringify({
          ok: true,
          data: {
            trackId: 'track-a',
            enabled: true,
            inputMode: 'guitar_di',
            monitoring: true,
            lowLatencyMonitoring: true,
            pedals: [
              {id: 'drive', type: 'overdrive', enabled: true, params: {drive: 0.6, tone: 0.4}},
            ],
            cabinet: {enabled: true, irId: 'guitar_uk_4x12', mix: 0.8},
          },
        });
      }
      return JSON.stringify({ok: true, data: {}});
    });
    window.audioEngine = {sendCommand};
    useDAWStore.setState({
      tracks: [{
        id: 'track-a',
        name: 'Voice',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      }],
      blocks: [{
        id: 'clip-a',
        trackId: 'track-a',
        name: 'Vocal',
        startBeat: 0,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
        isMuted: true,
        clipGainDb: -5,
        fadeInBeats: 0.5,
        fadeOutBeats: 1,
        isReversed: true,
        sourcePeakAmplitude: 0.5,
        audioFilePath: 'imports/vocal.wav',
        absoluteAudioFilePath: '/tmp/project/imports/vocal.wav',
      }],
    });

    const snapshot = captureProjectSnapshot();

    expect(snapshot.fxStates[0]?.slots[0]?.enabled).toBe(true);
    expect(snapshot.ampSimStates[0]).toMatchObject({
      trackId: 'track-a',
      enabled: true,
      cabinet: {irId: 'guitar_uk_4x12', mix: 0.8},
    });
    expect(snapshot.blocks[0]?.isMuted).toBe(true);
    expect(snapshot.blocks[0]?.clipGainDb).toBe(-5);
    expect(snapshot.blocks[0]?.fadeInBeats).toBe(0.5);
    expect(snapshot.blocks[0]?.fadeOutBeats).toBe(1);
    expect(snapshot.blocks[0]?.isReversed).toBe(true);
    expect(snapshot.blocks[0]?.sourcePeakAmplitude).toBe(0.5);
    expect(snapshot.mediaReferences).toEqual([{
      clipId: 'clip-a',
      trackId: 'track-a',
      kind: 'audio',
      name: 'Vocal',
      relativePath: 'imports/vocal.wav',
      absolutePath: '/tmp/project/imports/vocal.wav',
    }]);
  });
});
