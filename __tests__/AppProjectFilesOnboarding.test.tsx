import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {serializeApcSource, decomposeSnapshotToApcSource} from '../src/arrangement/apc';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const openProjectFolder = jest.fn();
const saveProjectFolder = jest.fn();
const setProjectAssetRoot = jest.fn();
const resolveAudioMedia = jest.fn();

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

function apcFilesWithDrums() {
  resetStore();
  useDAWStore.getState().addTrackFromTemplate('drum_machine');
  const files = serializeApcSource(decomposeSnapshotToApcSource(captureProjectSnapshot()));
  resetStore();
  return files;
}

beforeEach(() => {
  resetStore();
  window.localStorage.clear();
  sendCommand.mockImplementation(() => JSON.stringify({ok: true, data: {}}));
  openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/opened.apc', files: apcFilesWithDrums()});
  saveProjectFolder.mockResolvedValue({ok: true, path: '/tmp/saved.apc'});
  setProjectAssetRoot.mockResolvedValue({ok: true, writableRoot: '/tmp/opened.apc/assets'});
  resolveAudioMedia.mockResolvedValue({ok: true, resolved: []});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.projectFiles = {
    saveProjectFolder,
    openProjectFolder,
    setProjectAssetRoot,
    exportMixdown: jest.fn(),
  };
  window.mediaImport = {importAudio: jest.fn(), resolveAudioMedia};
});

afterEach(() => {
  cleanup();
  jest.restoreAllMocks();
  window.localStorage.clear();
  delete window.audioEngine;
  delete window.projectFiles;
  delete window.mediaImport;
});

test('opens an existing project from onboarding and dismisses onboarding', async () => {
  render(<App />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Open existing project'}));
  });

  expect(openProjectFolder).toHaveBeenCalledWith(undefined);
  await waitFor(() => expect(screen.queryByLabelText('Project onboarding')).not.toBeInTheDocument());
  expect(useDAWStore.getState().tracks[0]?.type).toBe('drum_machine');
});

test('opens only apc recent projects from onboarding', async () => {
  window.localStorage.setItem(
    'aiProducerCore.recentProjects',
    JSON.stringify(['/tmp/recent.apc', '/tmp/export.dawproject']),
  );
  openProjectFolder.mockResolvedValue({ok: true, path: '/tmp/recent.apc', files: apcFilesWithDrums()});

  render(<App />);

  expect(screen.getByText('recent.apc')).toBeInTheDocument();
  expect(screen.queryByText('export.dawproject')).not.toBeInTheDocument();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: /recent\.apc/i}));
  });

  expect(openProjectFolder).toHaveBeenCalledWith({path: '/tmp/recent.apc'});
  await waitFor(() => expect(screen.queryByLabelText('Project onboarding')).not.toBeInTheDocument());
});
