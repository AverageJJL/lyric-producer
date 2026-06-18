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

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {openBrowserDock} from './helpers/workspacePanels';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const importAudio = jest.fn();
const duplicateAudio = jest.fn();
const resolveAudioMedia = jest.fn();

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [{
      id: 'track-audio',
      name: 'Audio 1',
      isMuted: false,
      isSolo: false,
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isRecordArmed: false,
      isLocked: false,
    }],
    patterns: {},
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
      {
        id: 'clip-imported',
        trackId: 'track-audio',
        name: 'Imported',
        startBeat: 8,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/imported.wav',
        absoluteAudioFilePath: '/assets/imports/imported.wav',
      },
    ],
    selectedBlockId: 'clip-external-a',
    selectedBlockIds: ['clip-external-a'],
    selectedTrackId: 'track-audio',
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
    performanceMode: 'linear',
    looperLengthBars: 4,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
  });
}

beforeEach(() => {
  resetStore();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {
          durationSeconds: 3,
          lengthBeats: 6,
          waveformPeaks: [0.2, 0.4],
          sampleRate: 48000,
          channelCount: 2,
          fileBytes: 300000,
          peakAmplitude: 0.8,
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  duplicateAudio.mockResolvedValue({
    ok: true,
    originalPath: '/external/shared.wav',
    absolutePath: '/assets/imports/shared.wav',
    relativePath: 'imports/shared.wav',
    name: 'shared',
  });
  resolveAudioMedia.mockResolvedValue({ok: true, resolved: []});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.projectFiles = {saveProjectFolder: jest.fn(), openProjectFolder: jest.fn(), setProjectAssetRoot: jest.fn()};
  window.mediaImport = {importAudio, duplicateAudio, resolveAudioMedia};
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  importAudio.mockReset();
  duplicateAudio.mockReset();
  resolveAudioMedia.mockReset();
  window.localStorage.clear();
  delete window.audioEngine;
  delete window.projectFiles;
  delete window.mediaImport;
});

test('consolidates external project media through the media bin', async () => {
  render(<App />);
  openBrowserDock();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Consolidate'}));
  });

  await waitFor(() => {
    expect(duplicateAudio).toHaveBeenCalledWith({path: '/external/shared.wav'});
  });
  expect(duplicateAudio).toHaveBeenCalledTimes(1);
  expect(sendCommand).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/assets/imports/shared.wav'}),
  );

  const blocks = useDAWStore.getState().blocks;
  expect(blocks.find(block => block.id === 'clip-external-a')).toMatchObject({
    audioFilePath: 'imports/shared.wav',
    absoluteAudioFilePath: '/assets/imports/shared.wav',
    mediaSourceName: 'shared',
    sourceLengthBeats: 6,
  });
  expect(blocks.find(block => block.id === 'clip-external-b')).toMatchObject({
    audioFilePath: 'imports/shared.wav',
    absoluteAudioFilePath: '/assets/imports/shared.wav',
    mediaSourceName: 'shared',
  });
  expect(blocks.find(block => block.id === 'clip-imported')).toMatchObject({
    audioFilePath: 'imports/imported.wav',
    absoluteAudioFilePath: '/assets/imports/imported.wav',
  });
  expect(screen.getByText('Consolidated 2 clips.')).toBeInTheDocument();

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-external-a'))
    .toMatchObject({absoluteAudioFilePath: '/external/shared.wav'});
});
