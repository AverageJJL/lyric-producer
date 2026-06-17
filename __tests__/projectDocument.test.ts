import {applyArrangementOperations} from '../src/arrangement/operations';
import {
  createProjectDocument,
  openProjectDocument,
  parseProjectDocument,
  PROJECT_DOCUMENT_FORMAT,
  PROJECT_DOCUMENT_VERSION,
  serializeProjectDocument,
} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot, snapshotFingerprint} from '../src/arrangement/projectSnapshot';
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

function seedProject(): void {
  applyArrangementOperations(
    [
      {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
      {op: 'createTrack', templateId: 'drum_machine'},
      {op: 'setBpm', bpm: 132},
      {op: 'setPlayheadBeat', beat: 12},
      {op: 'setScale', scale: {root: 'D', mode: 'minor'}},
      {op: 'setSections', sections: [{id: 'intro', name: 'Intro', startBeat: 0, lengthBeats: 8}]},
    ],
    {skipNativeRefresh: true},
  );

  const tracks = useDAWStore.getState().tracks;
  const synthTrackId = tracks.find(track => track.type === 'software_instrument')?.id;
  const drumTrackId = tracks.find(track => track.type === 'drum_machine')?.id;
  useDAWStore.getState().setTrackVolumeDb(synthTrackId!, -9);
  useDAWStore.getState().setTrackPan(synthTrackId!, -0.25);
  useDAWStore.getState().setTrackGainDb(synthTrackId!, 3);
  useDAWStore.getState().setMasterVolumeDb(-4);
  useDAWStore.getState().setMasterPan(0.2);
  useDAWStore.getState().setSnapGrid('1/16');
  useDAWStore.getState().setRelativeSnapEnabled(true);
  useDAWStore.getState().setLooperLengthBars(8);
  useDAWStore.getState().setPerformanceMode('looper');
  useDAWStore.getState().setCycleRange(8, 16, {enable: true});
  const pattern = createEmptyPattern('Pattern A', 'pat-doc');
  pattern.steps.kick[0] = true;
  pattern.steps.snare[4] = true;

  applyArrangementOperations(
    [
      {
        op: 'upsertMidiClip',
        clip: {
          id: 'clip-lead',
          trackId: synthTrackId!,
          name: 'Lead',
          startBeat: 4,
          lengthBeats: 4,
          notes: [{note: 67, velocity: 96, startBeat: 0, lengthBeats: 1}],
        },
      },
      {op: 'upsertDrumPattern', pattern},
      {
        op: 'upsertDrumClip',
        clip: {
          id: 'clip-drums',
          trackId: drumTrackId!,
          name: 'Pattern A',
          startBeat: 0,
          lengthBeats: 8,
          patternId: 'pat-doc',
        },
      },
    ],
    {skipNativeRefresh: true},
  );
}

describe('project document', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('serializes and parses a versioned project document', () => {
    seedProject();
    const snapshot = captureProjectSnapshot();
    const document = createProjectDocument(snapshot, '2026-06-02T12:00:00.000Z');
    const serialized = serializeProjectDocument(document);
    const parsed = parseProjectDocument(serialized);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.document.format).toBe(PROJECT_DOCUMENT_FORMAT);
    expect(parsed.document.version).toBe(PROJECT_DOCUMENT_VERSION);
    expect(snapshotFingerprint(parsed.document.snapshot)).toBe(snapshotFingerprint(snapshot));
    expect(parsed.document.snapshot).toMatchObject({
      performanceMode: 'looper',
      looperLengthBars: 8,
    });
  });

  it('opens a document by replacing stale arrangement state', () => {
    seedProject();
    const original = captureProjectSnapshot();
    const document = createProjectDocument(original, '2026-06-02T12:00:00.000Z');

    resetStore();
    applyArrangementOperations([{op: 'createTrack', templateId: 'voice_audio'}], {skipNativeRefresh: true});

    const restored = openProjectDocument(document, {skipNativeRefresh: true});

    expect(snapshotFingerprint(restored)).toBe(snapshotFingerprint(original));
    expect(useDAWStore.getState().tracks.some(track => track.type === 'voice_audio'))
      .toBe(false);
  });

  it('persists voice-track input monitoring policy', () => {
    applyArrangementOperations([{op: 'createTrack', templateId: 'voice_audio'}], {
      skipNativeRefresh: true,
    });
    const voiceTrackId = useDAWStore.getState().tracks[0]?.id;
    expect(voiceTrackId).toBeDefined();
    useDAWStore.getState().setTrackInputMonitoring(voiceTrackId!, true);

    const document = createProjectDocument(captureProjectSnapshot(), '2026-06-02T12:00:00.000Z');
    resetStore();
    const restored = openProjectDocument(document, {skipNativeRefresh: true});

    expect(restored.tracks[0]).toMatchObject({
      id: voiceTrackId,
      isInputMonitoringEnabled: true,
    });
  });

  it('persists track automation mode and lane metadata', () => {
    applyArrangementOperations([{op: 'createTrack', templateId: 'virtual_instrument'}], {
      skipNativeRefresh: true,
    });
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();
    useDAWStore.getState().setTrackAutomationMode(trackId!, 'write');
    useDAWStore.getState().upsertTrackAutomationLane(trackId!, {
      targetType: 'instrument',
      parameterId: 'filter.cutoff',
      points: [{beat: 2, value: 0.8}],
    });

    const document = createProjectDocument(captureProjectSnapshot(), '2026-06-02T12:00:00.000Z');
    resetStore();
    const restored = openProjectDocument(document, {skipNativeRefresh: true});

    expect(restored.tracks[0]).toMatchObject({
      id: trackId,
      automationMode: 'write',
      automationLanes: expect.arrayContaining([
        {targetType: 'instrument', parameterId: 'filter.cutoff', points: [{beat: 2, value: 0.8}]},
      ]),
    });
  });

  it('normalizes legacy documents with media references and FX states', () => {
    seedProject();
    useDAWStore.setState(state => ({
      blocks: [...state.blocks, {
        id: 'clip-audio',
        trackId: state.tracks[0]!.id,
        name: 'Imported',
        startBeat: 12,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
        audioFilePath: 'imports/imported.wav',
      }],
    }));
    const legacyDocument = createProjectDocument(captureProjectSnapshot(), '2026-06-02T12:00:00.000Z');
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).mediaReferences;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).fxStates;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).snapGrid;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).isRelativeSnapEnabled;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).recordingCountInBeats;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).recordingPreRollBeats;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).isPunchRecordingEnabled;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).isLoopRecordingEnabled;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).recordingLatencyCompensationMs;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).performanceMode;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).looperLengthBars;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).isCycleEnabled;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).cycleStartBeat;
    delete (legacyDocument.snapshot as Partial<typeof legacyDocument.snapshot>).cycleEndBeat;

    const parsed = parseProjectDocument(JSON.stringify(legacyDocument));

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.document.snapshot.mediaReferences[0]).toMatchObject({
      clipId: 'clip-audio',
      relativePath: 'imports/imported.wav',
    });
    expect(parsed.document.snapshot.fxStates).toHaveLength(parsed.document.snapshot.tracks.length);
    expect(parsed.document.snapshot.snapGrid).toBe(DEFAULT_SNAP_GRID);
    expect(parsed.document.snapshot.isRelativeSnapEnabled).toBe(false);
    expect(parsed.document.snapshot.recordingCountInBeats).toBe(4);
    expect(parsed.document.snapshot.recordingPreRollBeats).toBe(0);
    expect(parsed.document.snapshot.isPunchRecordingEnabled).toBe(false);
    expect(parsed.document.snapshot.isLoopRecordingEnabled).toBe(false);
    expect(parsed.document.snapshot.recordingLatencyCompensationMs).toBe(0);
    expect(parsed.document.snapshot).toMatchObject({
      performanceMode: 'linear',
      looperLengthBars: 4,
      isCycleEnabled: false,
      cycleStartBeat: 0,
      cycleEndBeat: 4,
    });
  });

  it('rejects malformed documents before touching store state', () => {
    seedProject();
    const before = captureProjectSnapshot();
    const parsed = parseProjectDocument('{"format":"wrong"}');

    expect(parsed).toEqual({
      ok: false,
      error: 'Project document has an unsupported format.',
    });

    expect(snapshotFingerprint(captureProjectSnapshot())).toBe(snapshotFingerprint(before));
  });
});
