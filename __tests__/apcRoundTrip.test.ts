import {
  applyArrangementOperations,
} from '../src/arrangement/operations';
import {
  captureProjectSnapshot,
  emptyProjectSnapshot,
  snapshotFingerprint,
} from '../src/arrangement/projectSnapshot';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  parseApcSourceFiles,
  serializeApcSource,
} from '../src/arrangement/apc';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const SAVED_AT = '2026-01-01T00:00:00.000Z';

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
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

/** Build a non-trivial project so the round-trip exercises every snapshot field. */
function buildRichProject(): void {
  applyArrangementOperations(
    [
      {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
      {op: 'createTrack', templateId: 'drum_machine'},
      {op: 'setBpm', bpm: 132},
      {op: 'setMasterMix', volumeDb: -6.5, pan: 0.25},
      {op: 'setSnapGrid', snapGrid: '1/16'},
      {op: 'setRelativeSnap', enabled: true},
      {op: 'setPerformanceMode', mode: 'looper', looperLengthBars: 8},
      {op: 'setCycle', enabled: true, startBeat: 8, endBeat: 24},
      {op: 'setTimeSignature', timeSignature: {numerator: 6, denominator: 8}},
      {op: 'setScale', scale: {root: 'D', mode: 'minor'}},
      {op: 'setChord', chord: {symbol: 'Dm9'}},
      {
        op: 'setSections',
        sections: [{id: 'sec-1', name: 'Intro', startBeat: 0, lengthBeats: 8}],
      },
    ],
    {skipNativeRefresh: true},
  );

  const state = useDAWStore.getState();
  const synthTrackId = state.tracks.find(t => t.type === 'software_instrument')!.id;
  const drumTrackId = state.tracks.find(t => t.type === 'drum_machine')!.id;

  const pattern = createEmptyPattern('Groove', 'pat-apc');
  pattern.steps.kick[0] = true;
  pattern.steps.snare[4] = true;
  pattern.steps.hatClosed[2] = true;

  applyArrangementOperations(
    [
      {op: 'upsertDrumPattern', pattern},
      {
        op: 'upsertDrumClip',
        clip: {
          id: 'clip-drums',
          trackId: drumTrackId,
          name: 'Groove',
          startBeat: 0,
          lengthBeats: 8,
          patternId: 'pat-apc',
        },
      },
      {
        op: 'upsertMidiClip',
        clip: {
          id: 'clip-lead',
          trackId: synthTrackId,
          name: 'Lead',
          startBeat: 4,
          lengthBeats: 4,
          notes: [
            {note: 60, velocity: 100, startBeat: 0, lengthBeats: 1},
            {note: 67, velocity: 80, startBeat: 2, lengthBeats: 1},
          ],
        },
      },
      {op: 'setTrackMix', trackId: synthTrackId, volumeDb: -3, pan: -0.5},
      {op: 'setTrackLocked', trackId: drumTrackId, isLocked: true},
    ],
    {skipNativeRefresh: true},
  );

  // Keep these fields off their empty-snapshot defaults so persistence loss is visible.
  const store = useDAWStore.getState();
  store.setRecordingPreRollBeats(4);
  store.setRecordingLatencyCompensationMs(50);
  store.setPunchRecordingEnabled(true);
  store.setLoopRecordingEnabled(true);
  useDAWStore.setState({playheadBeat: 8, isPlaying: true});
}

describe('.apc source round-trip', () => {
  beforeEach(() => {
    resetStore();
    window.audioEngine = undefined;
  });

  it('decompose → compile preserves the snapshot fingerprint', () => {
    buildRichProject();
    const original = captureProjectSnapshot();
    const fingerprint = snapshotFingerprint(original);

    const source = decomposeSnapshotToApcSource(original, SAVED_AT);
    const result = compileApcSourceToSnapshot(source);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
      expect(snapshotFingerprint(result.snapshot)).toBe(fingerprint);
    }
  });

  it('covers every snapshot field in project.json / timeline.json / entity files', () => {
    // Structural guard independent of fixture values: if a new ProjectSnapshot field
    // is added but not routed into ApcProjectFile, ApcTimelineFile, or the explicit
    // entity/derived overrides, it would silently fall back to its empty default on
    // compile. This fails loudly the moment that happens.
    buildRichProject();
    const source = decomposeSnapshotToApcSource(captureProjectSnapshot(), SAVED_AT);
    const explicitOverrides = [
      'tracks',
      'blocks',
      'patterns',
      'fxStates',
      'fxSummaries',
      'ampSimStates',
      'mediaReferences',
      'copilotChats',
    ];
    const covered = new Set([
      ...Object.keys(source.project),
      ...Object.keys(source.timeline),
      ...explicitOverrides,
    ]);
    const missing = Object.keys(emptyProjectSnapshot()).filter(key => !covered.has(key));
    expect(missing).toEqual([]);
  });

  it('decompose → serialize → parse → compile preserves the fingerprint (full disk path)', () => {
    buildRichProject();
    const original = captureProjectSnapshot();
    const fingerprint = snapshotFingerprint(original);

    const source = decomposeSnapshotToApcSource(original, SAVED_AT);
    const files = serializeApcSource(source);

    expect(files.find(f => f.relativePath === 'manifest.json')).toBeDefined();
    expect(files.filter(f => f.relativePath.startsWith('tracks/')).length).toBe(
      original.tracks.length,
    );
    expect(files.filter(f => f.relativePath.startsWith('clips/')).length).toBe(
      original.blocks.length,
    );
    expect(files.filter(f => f.relativePath.startsWith('patterns/')).length).toBe(
      Object.keys(original.patterns).length,
    );

    const parsed = parseApcSourceFiles(files);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      const result = compileApcSourceToSnapshot(parsed.source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(snapshotFingerprint(result.snapshot)).toBe(fingerprint);
      }
    }
  });

  it('round-trips full FX + amp-sim + audio media (with native mocked)', () => {
    const sendCommand = jest.fn((command: string) => {
      if (command === 'get_track_fx') {
        return JSON.stringify({
          ok: true,
          data: {
            trackId: 'track-voice',
            slots: [
              {
                slot: 'eq',
                enabled: true,
                params: {pluginId: 'airwindows:Parametric', values: {treble: 0.7, dryWet: 1}},
              },
            ],
          },
        });
      }
      if (command === 'get_amp_sim') {
        return JSON.stringify({
          ok: true,
          data: {
            trackId: 'track-voice',
            enabled: true,
            inputMode: 'guitar_di',
            monitoring: true,
            lowLatencyMonitoring: true,
            pedals: [{id: 'drive', type: 'overdrive', enabled: true, params: {drive: 0.6}}],
            cabinet: {enabled: true, irId: 'guitar_uk_4x12', mix: 0.8},
          },
        });
      }
      return JSON.stringify({ok: true, data: {}});
    });
    window.audioEngine = {sendCommand};

    useDAWStore.setState({
      tracks: [
        {
          id: 'track-voice',
          name: 'Voice',
          isMuted: false,
          isSolo: false,
          type: 'voice_audio',
          instrumentId: 'voice_audio',
          presetId: 'voice_audio',
          isRecordArmed: false,
          isLocked: false,
        },
      ],
      blocks: [
        {
          id: 'clip-voice',
          trackId: 'track-voice',
          name: 'Vocal',
          startBeat: 0,
          lengthBeats: 4,
          type: 'audio',
          color: '#c45c26',
          isMuted: true,
          clipGainDb: -5,
          fadeInBeats: 0.5,
          audioFilePath: 'imports/vocal.wav',
          absoluteAudioFilePath: '/tmp/project/imports/vocal.wav',
        },
      ],
    });

    const original = captureProjectSnapshot();
    const fingerprint = snapshotFingerprint(original);
    expect(original.ampSimStates).toHaveLength(1);

    const source = decomposeSnapshotToApcSource(original, SAVED_AT);
    const result = compileApcSourceToSnapshot(source);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(snapshotFingerprint(result.snapshot)).toBe(fingerprint);
    }
  });
});
