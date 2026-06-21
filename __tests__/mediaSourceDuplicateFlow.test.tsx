import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

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
const sendCommandAsync = jest.fn();
const importAudio = jest.fn();
const importMidi = jest.fn();
const relinkAudio = jest.fn();
const duplicateAudio = jest.fn();
const revealAudioMedia = jest.fn();

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
        id: 'clip-linked',
        trackId: 'track-audio',
        name: 'Linked Clip',
        startBeat: 0,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/linked.wav',
        absoluteAudioFilePath: '/tmp/imports/linked.wav',
      },
      {
        id: 'clip-sibling',
        trackId: 'track-audio',
        name: 'Sibling Clip',
        startBeat: 4,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/linked.wav',
        absoluteAudioFilePath: '/tmp/imports/linked.wav',
      },
    ],
    selectedBlockId: 'clip-linked',
    selectedBlockIds: ['clip-linked'],
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
  sendCommandAsync.mockImplementation((command: string, payloadJson: string) =>
    Promise.resolve(sendCommand(command, payloadJson)),
  );
  duplicateAudio.mockResolvedValue({
    ok: true,
    originalPath: '/tmp/imports/linked.wav',
    absolutePath: '/tmp/assets/imports/linked-1.wav',
    relativePath: 'imports/linked-1.wav',
    name: 'linked-1',
  });
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
  window.mediaImport = {
    importAudio,
    importMidi,
    relinkAudio,
    duplicateAudio,
    revealAudioMedia,
  };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  importAudio.mockReset();
  importMidi.mockReset();
  relinkAudio.mockReset();
  duplicateAudio.mockReset();
  revealAudioMedia.mockReset();
  window.localStorage.clear();
  delete window.mediaImport;
});

test('duplicates one media-bin source without rebinding sibling clips', async () => {
  render(<App />);
  openBrowserDock();

  fireEvent.click(screen.getByRole('button', {name: 'Duplicate media Linked Clip'}));

  await waitFor(() => {
    expect(duplicateAudio).toHaveBeenCalledWith({path: '/tmp/imports/linked.wav'});
  });
  await waitFor(() => {
    expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-linked'))
      .toMatchObject({
        audioFilePath: 'imports/linked-1.wav',
        absoluteAudioFilePath: '/tmp/assets/imports/linked-1.wav',
        mediaSourceName: 'Linked Clip Copy',
        sourceLengthBeats: 6,
      });
  });

  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-sibling'))
    .toMatchObject({
      audioFilePath: 'imports/linked.wav',
      absoluteAudioFilePath: '/tmp/imports/linked.wav',
    });
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-sibling')?.mediaSourceName)
    .toBeUndefined();
  expect(sendCommandAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/assets/imports/linked-1.wav'}),
  );

  act(() => {
    useDAWStore.getState().undo();
  });
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-linked'))
    .toMatchObject({
      audioFilePath: 'imports/linked.wav',
      absoluteAudioFilePath: '/tmp/imports/linked.wav',
    });
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-linked')?.mediaSourceName)
    .toBeUndefined();
});
