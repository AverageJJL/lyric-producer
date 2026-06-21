import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openBrowserDock} from './helpers/workspacePanels';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
const recoverOfflineAudio = jest.fn();

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
    blocks: [{
      id: 'clip-missing',
      trackId: 'track-audio',
      name: 'Missing Clip',
      startBeat: 4,
      lengthBeats: 4,
      type: 'audio',
      color: '#64a5ff',
      audioFilePath: 'imports/missing.wav',
      absoluteAudioFilePath: '/tmp/imports/missing.wav',
      isMissingMedia: true,
    }],
    selectedBlockId: 'clip-missing',
    selectedBlockIds: ['clip-missing'],
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
      return JSON.stringify({ok: true, data: {sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {
          durationSeconds: 2,
          lengthBeats: 4,
          waveformPeaks: [0.1, 0.2],
          sampleRate: 48000,
          channelCount: 2,
          fileBytes: 200000,
          peakAmplitude: 0.5,
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  sendCommandAsync.mockImplementation((command: string, payloadJson: string) =>
    Promise.resolve(sendCommand(command, payloadJson)),
  );
  recoverOfflineAudio.mockResolvedValue({
    ok: true,
    folderPath: '/recovery',
    recovered: [{
      sourceKey: 'absolute:/tmp/imports/missing.wav',
      sourcePath: 'imports/missing.wav',
      matchedPath: '/recovery/missing.wav',
      originalPath: '/recovery/missing.wav',
      absolutePath: '/tmp/assets/imports/missing.wav',
      relativePath: 'imports/missing-recovered.wav',
      name: 'missing',
    }],
    missing: [],
  });
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
  window.mediaImport = {recoverOfflineAudio};
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  recoverOfflineAudio.mockReset();
  window.localStorage.clear();
  delete window.audioEngine;
  delete window.mediaImport;
});

test('recovers offline media sources through the media bin', async () => {
  render(<App />);
  openBrowserDock();

  fireEvent.click(screen.getByRole('button', {name: 'Recover Offline'}));

  await waitFor(() => {
    expect(recoverOfflineAudio).toHaveBeenCalledWith({
      sources: [{
        sourceKey: 'absolute:/tmp/imports/missing.wav',
        sourcePath: 'imports/missing.wav',
        name: 'Missing Clip',
      }],
    });
  });
  expect(sendCommandAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/assets/imports/missing.wav'}),
  );
  expect(useDAWStore.getState().blocks[0]).toMatchObject({
    audioFilePath: 'imports/missing-recovered.wav',
    absoluteAudioFilePath: '/tmp/assets/imports/missing.wav',
    isMissingMedia: false,
    sourceLengthBeats: 4,
  });
  expect(await screen.findByText('Recovered 1 clips.')).toBeInTheDocument();

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().blocks[0]).toMatchObject({isMissingMedia: true});
});
