import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';

// <App /> mounts the Copilot panel, which imports react-markdown (ESM) — stub the
// markdown/highlighter deps jest can't transform, as the other App-render tests do.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {decomposeSnapshotToApcSource, serializeApcSource} from '../src/arrangement/apc';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import type {AppLifecycleProjectCommand} from '../src/native/appLifecycleApi';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openProjectMenu} from './helpers/projectMenu';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const openProjectFolder = jest.fn();
const saveProjectFolder = jest.fn();
const setProjectAssetRoot = jest.fn();
const rendererReady = jest.fn();
const setProjectDirty = jest.fn();
let projectCommandHandler: ((command: AppLifecycleProjectCommand) => void) | null = null;

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
  sendCommand.mockImplementation((command: string) =>
    JSON.stringify(command === 'engine_status' || command === 'engine_status_fast'
      ? {ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}}
      : {ok: true, data: {}}),
  );
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  setProjectAssetRoot.mockResolvedValue({ok: true, writableRoot: '/tmp/menu.apc/assets'});
  window.projectFiles = {
    saveProjectFolder,
    openProjectFolder,
    setProjectAssetRoot,
    exportMixdown: jest.fn(),
    writeMidiFile: jest.fn(),
  };
  window.appLifecycle = {
    onProjectCommand: jest.fn(callback => {
      projectCommandHandler = callback;
      return jest.fn();
    }),
    rendererReady,
    setProjectDirty,
  };
  window.mediaImport = {
    importAudio: jest.fn(),
    resolveAudioMedia: jest.fn(async () => ({ok: true as const, resolved: []})),
  };
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  projectCommandHandler = null;
  delete window.audioEngine;
  delete window.projectFiles;
  delete window.appLifecycle;
  delete window.mediaImport;
});

test('handles Electron open-file project commands through the project lifecycle', async () => {
  act(() => {
    useDAWStore.getState().addTrackFromTemplate('drum_machine');
  });
  const files = serializeApcSource(decomposeSnapshotToApcSource(captureProjectSnapshot()));
  resetStore();
  openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/menu.apc', files});

  render(<App />);

  expect(rendererReady).toHaveBeenCalledTimes(1);
  await act(async () => {
    projectCommandHandler?.({command: 'openProjectPath', path: '/tmp/menu.apc'});
    await Promise.resolve();
  });

  expect(openProjectFolder).toHaveBeenCalledWith({path: '/tmp/menu.apc'});
  expect(useDAWStore.getState().tracks[0]?.type).toBe('drum_machine');
  openProjectMenu();
  await waitFor(() => {
    expect(screen.getByTitle('Project opened')).toBeInTheDocument();
  });
});
