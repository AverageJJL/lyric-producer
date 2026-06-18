import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

// <App /> mounts the Copilot panel (react-markdown is ESM) — stub the markdown/
// highlighter deps jest can't transform, matching the other App-render tests.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));
import {openProjectMenu} from './helpers/projectMenu';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const exportMixdown = jest.fn();
const exportStems = jest.fn();

function renderMixdownPayloads() {
  return sendCommand.mock.calls
    .filter(([command]) => command === 'render_mixdown_async')
    .map(([, payload]) => JSON.parse(payload));
}

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
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output'}});
    }
    if (command === 'render_mixdown_async') {
      return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'running'}});
    }
    if (command === 'get_render_mixdown_status') {
      return JSON.stringify({ok: true, data: {requestId: 'render-1', status: 'completed'}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  exportStems.mockImplementation(async request => ({
    ok: true,
    directoryPath: '/tmp/stems',
    stems: request.tracks.map((track: {trackId: string}) => ({
      trackId: track.trackId,
      path: `/tmp/stems/${track.trackId}.wav`,
    })),
  }));
  exportMixdown.mockResolvedValue({ok: true, path: '/tmp/clip.wav'});
  window.audioEngine = {
    sendCommand,
    onEvent: () => () => undefined,
  };
  window.projectFiles = {
    saveProjectFolder: jest.fn(),
    openProjectFolder: jest.fn(),
    setProjectAssetRoot: jest.fn(),
    exportMixdown,
    exportStems,
  };
  window.mediaImport = {
    importAudio: jest.fn(),
    resolveAudioMedia: jest.fn().mockResolvedValue({ok: true, resolved: []}),
  };
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  exportMixdown.mockReset();
  exportStems.mockReset();
  window.localStorage.clear();
  delete window.audioEngine;
  delete window.projectFiles;
  delete window.mediaImport;
  jest.restoreAllMocks();
});

test('exports native track stems through the toolbar bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
  });
  const tracks = useDAWStore.getState().tracks.map(track => ({
    trackId: track.id,
    name: track.name,
  }));
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Stems'}));
  });

  expect(exportStems).toHaveBeenCalledWith({
    title: 'Export Stems',
    defaultPath: 'Stems',
    tracks,
  });
  for (const track of tracks) {
    expect(renderMixdownPayloads()).toContainEqual(
      expect.objectContaining({path: `/tmp/stems/${track.trackId}.wav`, trackId: track.trackId}),
    );
  }
  openProjectMenu();
  await waitFor(() => {
    expect(screen.getByTitle('Stems exported')).toBeInTheDocument();
  });
});

test('exports the active selected clip through the toolbar bridge', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
  });
  const trackId = useDAWStore.getState().tracks[0]!.id;
  act(() => {
    useDAWStore.setState({
      blocks: [{
        id: 'clip-lead',
        trackId,
        name: 'Lead',
        startBeat: 2,
        lengthBeats: 3,
        type: 'midi',
        color: '#4a7fd4',
        notes: [],
      }],
      selectedBlockId: 'clip-lead',
      selectedBlockIds: ['clip-lead'],
    });
  });
  render(<App />);
  openProjectMenu();

  await act(async () => {
    fireEvent.click(screen.getByRole('menuitem', {name: 'Clip'}));
  });

  expect(exportMixdown).toHaveBeenCalledWith({
    title: 'Export Selected Clip',
    defaultPath: 'Lead Clip.wav',
  });
  expect(renderMixdownPayloads()).toContainEqual(expect.objectContaining({
    path: '/tmp/clip.wav',
    trackId,
    startBeat: 2,
    endBeat: 5,
    tailBeats: 2,
  }));
  openProjectMenu();
  await waitFor(() => {
    expect(screen.getByTitle('Clip exported')).toBeInTheDocument();
  });
});
