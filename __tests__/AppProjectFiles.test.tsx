import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openProjectMenu} from './helpers/projectMenu';
import {App} from '../src/web/App';
import {createProjectDocument, serializeProjectDocument} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot, snapshotFingerprint} from '../src/arrangement/projectSnapshot';

const sendCommand = jest.fn();
const saveProject = jest.fn();
const openProject = jest.fn();
const exportMixdown = jest.fn();
const writeMidiFile = jest.fn();
const resolveAudioMedia = jest.fn();

const asyncRenderPayloads = () => sendCommand.mock.calls
  .filter(([command]) => command === 'render_mixdown_async')
  .map(([, payload]) => JSON.parse(payload));

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
  saveProject.mockResolvedValue({ok: true, path: '/tmp/song.apcproject'});
  openProject.mockResolvedValue({ok: false, canceled: true, error: 'Canceled'});
  exportMixdown.mockResolvedValue({ok: true, path: '/tmp/mix.wav'});
  writeMidiFile.mockResolvedValue({ok: true, path: '/tmp/arrangement.mid'});
  resolveAudioMedia.mockResolvedValue({ok: true, resolved: []});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.projectFiles = {saveProject, openProject, exportMixdown, writeMidiFile};
  window.mediaImport = {importAudio: jest.fn(), resolveAudioMedia};
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  saveProject.mockReset();
  openProject.mockReset();
  exportMixdown.mockReset();
  writeMidiFile.mockReset();
  resolveAudioMedia.mockReset();
  jest.restoreAllMocks();
  window.localStorage.clear();
  delete window.projectFiles;
  delete window.mediaImport;
});

test('renders project file controls and saves through the bridge', async () => {
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

  expect(saveProject).toHaveBeenCalledWith({
    content: expect.stringContaining('"format":"ai-producer-core.project"'),
  });
  openProjectMenu();
  expect(screen.getByTitle('Project saved')).toHaveTextContent('song.apcproject');
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

  expect(openProject).not.toHaveBeenCalled();
});

test('autosaves dirty drafts and recovers them', async () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });

  expect(window.localStorage.getItem('aiProducerCore.autosaveDraft')).toContain(
    'ai-producer-core.project',
  );
  openProjectMenu();
  expect(await screen.findByRole('menuitem', {name: 'Recover'})).toBeInTheDocument();
});

test('opens a recent project path through the bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
  });
  const content = serializeProjectDocument(createProjectDocument(captureProjectSnapshot()));
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.recentProjects',
    JSON.stringify(['/tmp/recent.apcproject']),
  );
  openProject.mockResolvedValue({ok: true, path: '/tmp/recent.apcproject', content});

  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'recent.apcproject'}));
  });

  expect(openProject).toHaveBeenCalledWith({path: '/tmp/recent.apcproject'});
  expect(useDAWStore.getState().tracks[0]?.type).toBe('drum_machine');
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
  const content = serializeProjectDocument(createProjectDocument(captureProjectSnapshot()));
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.recentProjects',
    JSON.stringify(['/tmp/missing.apcproject']),
  );
  openProject.mockResolvedValue({ok: true, path: '/tmp/missing.apcproject', content});
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
    fireEvent.click(screen.getByRole('menuitem', {name: 'missing.apcproject'}));
  });

  expect(resolveAudioMedia).toHaveBeenCalledWith({
    references: [expect.objectContaining({clipId: 'clip-a'})],
  });
  expect(useDAWStore.getState().blocks[0]?.isMissingMedia).toBe(true);
  openProjectMenu();
  expect(screen.getByTitle('Project opened (1 missing media)')).toBeInTheDocument();
});

test('recovers an autosave document into dirty project state', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('voice_audio');
  });
  const snapshot = captureProjectSnapshot();
  const content = serializeProjectDocument(createProjectDocument(snapshot));
  const savedFingerprint = snapshotFingerprint({
    ...snapshot,
    tracks: [],
    blocks: [],
  });
  resetStore();
  window.localStorage.setItem(
    'aiProducerCore.autosaveDraft',
    JSON.stringify({
      path: '/tmp/draft.apcproject',
      content,
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
  expect(screen.getByText('draft.apcproject *')).toBeInTheDocument();
});
