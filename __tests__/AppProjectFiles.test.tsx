import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

// <App /> mounts the Copilot panel, which imports react-markdown (ESM) — stub the
// markdown/highlighter deps jest can't transform, as the other App-render tests do.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openProjectMenu} from './helpers/projectMenu';
import {App} from '../src/web/App';
import {decomposeSnapshotToApcSource, serializeApcSource} from '../src/arrangement/apc';
import {captureProjectSnapshot, snapshotFingerprint} from '../src/arrangement/projectSnapshot';

const sendCommand = jest.fn();
const saveProjectFolder = jest.fn();
const openProjectFolder = jest.fn();
const setProjectAssetRoot = jest.fn();
const exportMixdown = jest.fn();
const writeMidiFile = jest.fn();
const resolveAudioMedia = jest.fn();

const asyncRenderPayloads = () => sendCommand.mock.calls
  .filter(([command]) => command === 'render_mixdown_async')
  .map(([, payload]) => JSON.parse(payload));

// The working `.apc` source tree for the current store state — what the bridge would
// hand back from open/recover, mirroring how a real Song.apc/ folder is serialized.
const apcFiles = () => serializeApcSource(decomposeSnapshotToApcSource(captureProjectSnapshot()));

function resetStore(): void {
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

beforeEach(() => {
  resetStore();
  window.localStorage.clear();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    if (command === 'render_mixdown_async') {
      return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'running'}});
    }
    if (command === 'get_render_mixdown_status') {
      return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'completed', path: '/tmp/mix.wav', fileBytes: 4096}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  saveProjectFolder.mockResolvedValue({ok: true, path: '/tmp/song.apc'});
  openProjectFolder.mockResolvedValue({ok: false, canceled: true, error: 'Canceled'});
  setProjectAssetRoot.mockResolvedValue({ok: true, writableRoot: '/tmp/song.apc/assets'});
  exportMixdown.mockResolvedValue({ok: true, path: '/tmp/mix.wav'});
  writeMidiFile.mockResolvedValue({ok: true, path: '/tmp/arrangement.mid'});
  resolveAudioMedia.mockResolvedValue({ok: true, resolved: []});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.projectFiles = {saveProjectFolder, openProjectFolder, setProjectAssetRoot, exportMixdown, writeMidiFile};
  window.mediaImport = {importAudio: jest.fn(), resolveAudioMedia};
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  saveProjectFolder.mockReset();
  openProjectFolder.mockReset();
  setProjectAssetRoot.mockReset();
  exportMixdown.mockReset();
  writeMidiFile.mockReset();
  resolveAudioMedia.mockReset();
  jest.restoreAllMocks();
  window.localStorage.clear();
  delete window.projectFiles;
  delete window.mediaImport;
});

test('renders project file controls and saves the .apc source tree through the bridge', async () => {
  render(<App />);
  openProjectMenu();

  expect(screen.getByRole('menuitem', {name: 'New'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Open'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Save'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Save As'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Export'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Clip'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'Stems'})).toBeInTheDocument();
  expect(screen.getByRole('menuitem', {name: 'MIDI'})).toBeInTheDocument();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Save'}));
  });

  expect(saveProjectFolder).toHaveBeenCalledWith(
    expect.objectContaining({
      files: expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'manifest.json',
          content: expect.stringContaining('"format":"ai-producer-core.apc"'),
        }),
      ]),
    }),
  );
  openProjectMenu();
  expect(screen.getByTitle('Project saved')).toHaveTextContent('song');
});

test('exports a native full-mix WAV through the bridge', async () => {
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Export'}));
  });

  expect(exportMixdown).toHaveBeenCalledTimes(1);
  expect(asyncRenderPayloads()).toContainEqual(
    expect.objectContaining({path: '/tmp/mix.wav'}),
  );
  openProjectMenu();
  expect(screen.getByTitle('Mixdown exported')).toBeInTheDocument();
});

test('exports project MIDI clips through the bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });
  const trackId = useDAWStore.getState().tracks[0]!.id;
  useDAWStore.setState({
    blocks: [{
      id: 'clip-midi',
      trackId,
      name: 'Lead',
      startBeat: 0,
      lengthBeats: 4,
      type: 'midi',
      color: '#4a7fd4',
      notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
    }],
  });
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'MIDI'}));
  });

  expect(writeMidiFile).toHaveBeenCalledWith({
    base64: expect.stringMatching(/^TVRoZA/),
  });
  openProjectMenu();
  expect(screen.getByTitle('MIDI exported')).toBeInTheDocument();
});

test('asks before discarding dirty project changes', async () => {
  jest.spyOn(window, 'confirm').mockReturnValue(false);
  render(<App />);

  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });

  openProjectMenu();
  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Open'}));
  });

  expect(openProjectFolder).not.toHaveBeenCalled();
});

test('autosaves dirty drafts and recovers them', async () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });

  // Autosave now persists the .apc source tree (the manifest carries the apc format).
  expect(window.localStorage.getItem('aiProducerCore.autosaveDraft')).toContain(
    'ai-producer-core.apc',
  );
  openProjectMenu();
  expect(await screen.findByRole('menuitem', {name: 'Recover'})).toBeInTheDocument();
});

test('opens a recent project folder through the bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
  });
  const files = apcFiles();
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.recentProjects',
    JSON.stringify(['/tmp/recent.apc']),
  );
  openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/recent.apc', files});
  sendCommand.mockClear();

  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'recent.apc'}));
  });

  expect(openProjectFolder).toHaveBeenCalledWith({path: '/tmp/recent.apc'});
  expect(sendCommand.mock.calls.map(([command]) => command)).not.toContain(
    'refresh_audio_device',
  );
  expect(useDAWStore.getState().tracks[0]?.type).toBe('drum_machine');
});

test('opens recent projects with external audio clips without native audio upserts', async () => {
  jest.useFakeTimers();
  try {
    const stems = ['bass', 'drums', 'guitar', 'other', 'piano'];
    useDAWStore.setState({
      tracks: stems.map((stem, index) => ({
        id: `track-frozen-${index}`,
        name: `Frozen Hearts ${stem}`,
        isMuted: false,
        isSolo: false,
        type: 'voice_audio' as const,
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      })),
      blocks: stems.map((stem, index) => ({
        id: `clip-frozen-${index}`,
        trackId: `track-frozen-${index}`,
        name: `Frozen Hearts_${stem}`,
        startBeat: 0,
        lengthBeats: 248.163,
        type: 'audio' as const,
        color: '#5a8cff',
        audioFilePath: `imports/Frozen Hearts_${stem}-3.mp3`,
        absoluteAudioFilePath:
          `/Users/jlang/Library/Application Support/MusicApp/assets/imports/Frozen Hearts_${stem}-3.mp3`,
        sourceLengthBeats: 248.163,
        sourceOffsetBeats: 0,
      })),
    });
    const files = apcFiles();
    resetStore();
    window.localStorage.setItem(
      'aiProducerCore.recentProjects',
      JSON.stringify(['/tmp/frozen-hearts.apc']),
    );
    openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/frozen-hearts.apc', files});

    render(<App />);
    sendCommand.mockClear();
    openProjectMenu();

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', {name: 'frozen-hearts.apc'}));
    });
    act(() => {
      jest.advanceTimersByTime(250);
    });

    const commandNames = sendCommand.mock.calls.map(([command]) => command);
    expect(openProjectFolder).toHaveBeenCalledWith({path: '/tmp/frozen-hearts.apc'});
    expect(commandNames).not.toContain('refresh_audio_device');
    expect(commandNames).not.toContain('upsert_audio_clip');
    expect(useDAWStore.getState().blocks).toHaveLength(5);
  } finally {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  }
});

test('marks missing audio media when opening a project', async () => {
  useDAWStore.setState({
    tracks: [{
      id: 'track-a',
      name: 'Audio',
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
      name: 'Missing Take',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#c45c26',
      audioFilePath: 'imports/missing.wav',
    }],
  });
  const files = apcFiles();
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.recentProjects',
    JSON.stringify(['/tmp/missing.apc']),
  );
  openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/missing.apc', files});
  resolveAudioMedia.mockResolvedValue({
    ok: true,
    resolved: [{
      clipId: 'clip-a',
      exists: false,
      relativePath: 'imports/missing.wav',
    }],
  });

  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'missing.apc'}));
  });

  expect(resolveAudioMedia).toHaveBeenCalledWith({
    references: [expect.objectContaining({clipId: 'clip-a'})],
  });
  expect(useDAWStore.getState().blocks[0]?.isMissingMedia).toBe(true);
  openProjectMenu();
  expect(screen.getByTitle('Project opened (1 missing media)')).toBeInTheDocument();
});

test('startup audio-device heal does not re-upsert restored project media', () => {
  jest.useFakeTimers();
  try {
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
      blocks: [{
        id: 'clip-audio',
        trackId: 'track-audio',
        name: 'Frozen Hearts',
        startBeat: 0,
        lengthBeats: 248,
        type: 'audio',
        color: '#5a8cff',
        audioFilePath: 'imports/Frozen Hearts_bass-3.mp3',
        absoluteAudioFilePath:
          '/Users/jlang/Library/Application Support/MusicApp/assets/imports/Frozen Hearts_bass-3.mp3',
        sourceLengthBeats: 248,
        sourceOffsetBeats: 0,
      }],
    });

    render(<App />);
    sendCommand.mockClear();

    act(() => {
      jest.advanceTimersByTime(400);
    });

    const commandNames = sendCommand.mock.calls.map(([command]) => command);
    expect(commandNames).toContain('refresh_audio_device');
    expect(sendCommand).toHaveBeenCalledWith(
      'refresh_audio_device',
      JSON.stringify({
        useSystemDefault: true,
        forceReopen: false,
        restoreStereoPlayback: false,
      }),
    );
    expect(commandNames).not.toContain('upsert_audio_clip');
    expect(commandNames).not.toContain('setTracks');
  } finally {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  }
});

test('recovers an autosave draft into dirty project state', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('voice_audio');
  });
  const snapshot = captureProjectSnapshot();
  const files = serializeApcSource(decomposeSnapshotToApcSource(snapshot));
  const savedFingerprint = snapshotFingerprint({
    ...snapshot,
    tracks: [],
    blocks: [],
  });
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.autosaveDraft',
    JSON.stringify({
      path: '/tmp/draft.apc',
      files,
      savedFingerprint,
      savedAt: '2026-06-02T12:00:00.000Z',
    }),
  );

  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Recover'}));
  });

  expect(useDAWStore.getState().tracks[0]?.type).toBe('voice_audio');
  openProjectMenu();
  expect(screen.getByText('draft *')).toBeInTheDocument();
});
