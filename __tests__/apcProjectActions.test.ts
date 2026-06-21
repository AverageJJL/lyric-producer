import {
  createNewApcProject,
  decomposeSnapshotToApcSource,
  openApcProject,
  saveCurrentApcProject,
  serializeApcSource,
} from '../src/arrangement/apc';
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
import {resetCopilotChatHistoryForTests} from '../src/assistant/copilotChatHistory';
import {refreshPlaybackAndInstruments} from '../src/native/refreshPlayback';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const TS = '2026-01-01T00:00:00.000Z';
const mockedRefreshPlayback = refreshPlaybackAndInstruments as jest.Mock;

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tracks: [],
    patterns: {},
    blocks: [],
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

function folderBridge(overrides: Partial<ProjectFileBridge>): ProjectFileBridge {
  return {
    saveProjectFolder: jest.fn(async () => ({ok: true as const, path: '/tmp/song.apc'})),
    openProjectFolder: jest.fn(async () => ({ok: false as const, canceled: true, error: 'x'})),
    setProjectAssetRoot: jest.fn(async () => ({ok: true as const, writableRoot: '/tmp/song.apc/assets'})),
    exportMixdown: jest.fn(),
    ...overrides,
  } as unknown as ProjectFileBridge;
}

describe('apc project actions', () => {
  beforeEach(() => {
    resetStore();
    resetCopilotChatHistoryForTests();
    mockedRefreshPlayback.mockClear();
  });

  it('saves the current project as an .apc folder tree through the bridge', async () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'}],
      {skipNativeRefresh: true},
    );
    const saveProjectFolder = jest.fn(async () => ({ok: true as const, path: '/tmp/song.apc'}));
    const setProjectAssetRoot = jest.fn(async () => ({ok: true as const, writableRoot: '/tmp/song.apc/assets'}));
    const bridge = folderBridge({saveProjectFolder, setProjectAssetRoot});

    const result = await saveCurrentApcProject(bridge, '/tmp/song.apc');

    expect(result.ok).toBe(true);
    expect(saveProjectFolder).toHaveBeenCalledWith(
      expect.objectContaining({
        folderPath: '/tmp/song.apc',
        files: expect.arrayContaining([
          expect.objectContaining({relativePath: 'manifest.json'}),
        ]),
      }),
    );
    expect(setProjectAssetRoot).toHaveBeenCalledWith({folderPath: '/tmp/song.apc'});
    expect(result.ok && result.fingerprint).toBe(snapshotFingerprint(captureProjectSnapshot()));
  });

  it('consolidates external media before Save As serializes the tree', async () => {
    const saveProjectFolder = jest.fn(async () => ({ok: true as const, path: '/tmp/save-as.apc'}));
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
      sendCommandAsync: jest.fn(async (command: string) => JSON.stringify({
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
    const bridge = folderBridge({saveProjectFolder});
    const mediaBridge = {importAudio: jest.fn(), duplicateAudio} as MediaImportBridge;

    const result = await saveCurrentApcProject(bridge, undefined, {consolidateMedia: true, mediaBridge});

    expect(result).toMatchObject({ok: true, consolidatedMediaCount: 2, failedMediaCount: 0});
    expect(duplicateAudio).toHaveBeenCalledWith({path: '/external/shared.wav'});
    const saveCalls = saveProjectFolder.mock.calls as unknown as Array<[{
      files: Array<{relativePath: string; content: string}>;
    }]>;
    const finalSave = saveCalls[saveCalls.length - 1]?.[0];
    const files = finalSave?.files ?? [];
    const savedClips = files
      .filter((file: {relativePath: string}) => file.relativePath.startsWith('clips/'))
      .map((file: {content: string}) => JSON.parse(file.content));
    expect(savedClips).toHaveLength(2);
    expect(savedClips.every((clip: {audioFilePath?: string}) =>
      clip.audioFilePath === 'imports/shared.wav',
    )).toBe(true);
    expect(savedClips.every((clip: {absoluteAudioFilePath?: string}) =>
      clip.absoluteAudioFilePath === undefined,
    )).toBe(true);
  });

  it('opens an .apc folder and replaces stale state', async () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'drum_machine'}],
      {skipNativeRefresh: true},
    );
    const original = captureProjectSnapshot();
    const files = serializeApcSource(decomposeSnapshotToApcSource(original, TS));

    resetStore();
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'voice_audio'}],
      {skipNativeRefresh: true},
    );
    const openProjectFolder = jest.fn(async () => ({ok: true as const, path: '/tmp/song.apc', files}));
    const bridge = folderBridge({openProjectFolder});
    mockedRefreshPlayback.mockClear();

    const result = await openApcProject(bridge);

    expect(result.ok).toBe(true);
    expect(mockedRefreshPlayback).not.toHaveBeenCalled();
    expect(snapshotFingerprint(captureProjectSnapshot())).toBe(snapshotFingerprint(original));
    expect(useDAWStore.getState().tracks.some(track => track.type === 'voice_audio')).toBe(false);
  });

  it('creates a new empty project', async () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'voice_audio'}],
      {skipNativeRefresh: true},
    );

    const result = await createNewApcProject();

    expect(result.ok).toBe(true);
    expect(useDAWStore.getState().tracks).toEqual([]);
    expect(useDAWStore.getState().blocks).toEqual([]);
  });
});
