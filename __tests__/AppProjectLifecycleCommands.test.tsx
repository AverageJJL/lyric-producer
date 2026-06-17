import React from 'react';
import {act, cleanup, render, screen, waitFor} from '@testing-library/react';

import {createProjectDocument, serializeProjectDocument} from '../src/arrangement/projectDocument';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import type {AppLifecycleProjectCommand} from '../src/native/appLifecycleApi';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openProjectMenu} from './helpers/projectMenu';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const openProject = jest.fn();
const saveProject = jest.fn();
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
  window.projectFiles = {
    saveProject,
    openProject,
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
  const content = serializeProjectDocument(createProjectDocument(captureProjectSnapshot()));
  resetStore();
  openProject.mockResolvedValue({ok: true, path: '/tmp/menu.apcproject', content});

  render(<App />);

  expect(rendererReady).toHaveBeenCalledTimes(1);
  await act(async () => {
    projectCommandHandler?.({command: 'openProjectPath', path: '/tmp/menu.apcproject'});
    await Promise.resolve();
  });

  expect(openProject).toHaveBeenCalledWith({path: '/tmp/menu.apcproject'});
  expect(useDAWStore.getState().tracks[0]?.type).toBe('drum_machine');
  openProjectMenu();
  await waitFor(() => {
    expect(screen.getByTitle('Project opened')).toBeInTheDocument();
  });
});
