import {
  createNewProjectFile,
  openProjectFile,
  saveCurrentProjectFile,
} from '../src/arrangement/projectFileActions';
import {
  createProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
} from '../src/arrangement/projectDocument';
import {
  captureProjectSnapshot,
  snapshotFingerprint,
} from '../src/arrangement/projectSnapshot';
import {applyArrangementOperations} from '../src/arrangement/operations';
import type {ProjectFileBridge} from '../src/native/projectFileApi';
import type {MediaImportBridge} from '../src/native/mediaImportApi';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
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
  });
}

describe('project file actions', () => {
  beforeEach(() => resetStore());

  it('saves the current project through the file bridge', async () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );
    const bridge: ProjectFileBridge = {
      saveProject: jest.fn(async () => ({ok: true, path: '/tmp/song.apcproject'})),
      openProject: jest.fn(),
    };

    const result = await saveCurrentProjectFile(bridge, '/tmp/song.apcproject');

    expect(result.ok).toBe(true);
    expect(bridge.saveProject).toHaveBeenCalledWith({
      path: '/tmp/song.apcproject',
      content: expect.stringContaining('"format":"ai-producer-core.project"'),
    });
    expect(result.ok && result.fingerprint).toBe(
      snapshotFingerprint(captureProjectSnapshot()),
    );
  });

  it('consolidates external media before Save As serializes the project', async () => {
    const saveProject = jest.fn(async () => ({ok: true as const, path: '/tmp/save-as.apcproject'}));
    const duplicateAudio = jest.fn(async () => ({
      ok: true as const,
      originalPath: '/external/shared.wav',
      absolutePath: '/tmp/assets/imports/shared.wav',
      relativePath: 'imports/shared.wav',
      name: 'shared',
    }));
    window.audioEngine = {
      sendCommand: jest.fn((command: string) => JSON.stringify({
        ok: true,
        data: command === 'engine_status' || command === 'engine_status_fast'
          ? {sampleRate: 48000}
          : {
              durationSeconds: 3,
              lengthBeats: 6,
              waveformPeaks: [0.2, 0.4],
              sampleRate: 48000,
              channelCount: 2,
              fileBytes: 300000,
              peakAmplitude: 0.8,
            },
      })),
      onEvent: () => () => undefined,
    };
    useDAWStore.setState({
      tracks: [{
        id: 'track-audio',
        name: 'Audio',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      }],
      blocks: [
        {
          id: 'clip-external-a',
          trackId: 'track-audio',
          name: 'External A',
          startBeat: 0,
          lengthBeats: 4,
          type: 'audio',
          color: '#64a5ff',
          absoluteAudioFilePath: '/external/shared.wav',
        },
        {
          id: 'clip-external-b',
          trackId: 'track-audio',
          name: 'External B',
          startBeat: 4,
          lengthBeats: 4,
          type: 'audio',
          color: '#64a5ff',
          absoluteAudioFilePath: '/external/shared.wav',
        },
      ],
    });
    const bridge: ProjectFileBridge = {saveProject, openProject: jest.fn()};
    const mediaBridge = {importAudio: jest.fn(), duplicateAudio} as MediaImportBridge;

    const result = await saveCurrentProjectFile(
      bridge,
      undefined,
      {consolidateMedia: true, mediaBridge},
    );

    expect(result).toMatchObject({
      ok: true,
      consolidatedMediaCount: 2,
      failedMediaCount: 0,
    });
    expect(duplicateAudio).toHaveBeenCalledWith({path: '/external/shared.wav'});
    const savedContent = saveProject.mock.calls[0]?.[0].content;
    expect(typeof savedContent).toBe('string');
    const parsed = parseProjectDocument(savedContent);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.document.snapshot.blocks.map(block => block.absoluteAudioFilePath))
      .toEqual(['/tmp/assets/imports/shared.wav', '/tmp/assets/imports/shared.wav']);
    expect(parsed.document.snapshot.mediaReferences.map(reference => reference.relativePath))
      .toEqual(['imports/shared.wav', 'imports/shared.wav']);
  });

  it('opens a project and replaces stale state', async () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'drum_machine'}],
      {skipNativeRefresh: true},
    );
    const original = captureProjectSnapshot();
    const content = serializeProjectDocument(createProjectDocument(original));

    resetStore();
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'voice_audio'}],
      {skipNativeRefresh: true},
    );
    const bridge: ProjectFileBridge = {
      saveProject: jest.fn(),
      openProject: jest.fn(async () => ({ok: true, path: '/tmp/song.apcproject', content})),
    };

    const result = await openProjectFile(bridge);

    expect(result.ok).toBe(true);
    expect(snapshotFingerprint(captureProjectSnapshot())).toBe(
      snapshotFingerprint(original),
    );
    expect(useDAWStore.getState().tracks.some(track => track.type === 'voice_audio'))
      .toBe(false);
  });

  it('creates a new empty project', () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'voice_audio'}],
      {skipNativeRefresh: true},
    );

    const result = createNewProjectFile();

    expect(result.ok).toBe(true);
    expect(useDAWStore.getState().tracks).toEqual([]);
    expect(useDAWStore.getState().blocks).toEqual([]);
  });
});
