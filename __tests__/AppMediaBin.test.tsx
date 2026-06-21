import React from 'react';
import {cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';

jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {openBrowserDock, openSamplesDock} from './helpers/workspacePanels';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
const importAudio = jest.fn();
const importMidi = jest.fn();
const relinkAudio = jest.fn();
const revealAudioMedia = jest.fn();
const browseSamples = jest.fn();

function resetStore(): void {
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
        sourceSampleRate: 48000,
      },
      {
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
      },
      {
        id: 'clip-linked-sibling',
        trackId: 'track-audio',
        name: 'Linked Sibling',
        startBeat: 6,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/linked.wav',
        absoluteAudioFilePath: '/tmp/imports/linked.wav',
        sourceSampleRate: 48000,
      },
      {
        id: 'clip-warning',
        trackId: 'track-audio',
        name: 'Warning Clip',
        startBeat: 8,
        lengthBeats: 4,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/warning.wav',
        absoluteAudioFilePath: '/tmp/imports/warning.wav',
        sourceSampleRate: 44100,
        mediaValidationWarning: 'Source sample rate 44100 Hz differs from device 48000 Hz.',
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
  revealAudioMedia.mockResolvedValue({ok: true});
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
  window.mediaImport = {importAudio, importMidi, relinkAudio, revealAudioMedia};
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  importAudio.mockReset();
  importMidi.mockReset();
  relinkAudio.mockReset();
  revealAudioMedia.mockReset();
  browseSamples.mockReset();
  window.localStorage.clear();
  delete window.mediaImport;
  delete window.audioEngine;
});

test('browses provider samples and imports through the audio bridge', async () => {
  browseSamples.mockResolvedValueOnce({
    ok: true,
    providers: [{id: 'external_pack', label: 'External Pack'}],
    samples: [{
      id: 'external_pack:kick.wav',
      providerId: 'external_pack',
      providerLabel: 'External Pack',
      name: 'Provider Kick',
      absolutePath: '/tmp/provider/kick.wav',
      fileBytes: 1048576,
      modifiedAt: '2026-06-03T00:00:00.000Z',
      tags: ['kick', 'drum'],
    }],
  });
  importAudio.mockResolvedValue({
    ok: true,
    originalPath: '/tmp/provider/kick.wav',
    absolutePath: '/tmp/assets/imports/kick.wav',
    relativePath: 'imports/kick.wav',
    name: 'Provider Kick',
  });
  window.mediaImport = {
    importAudio,
    importMidi,
    relinkAudio,
    revealAudioMedia,
    browseSamples,
  };

  render(<App />);
  openSamplesDock();

  expect((await screen.findAllByText('Provider Kick')).length).toBeGreaterThan(0);
  fireEvent.click(screen.getByRole('button', {name: 'Import sample Provider Kick'}));

  await waitFor(() => {
    expect(importAudio).toHaveBeenCalledWith({path: '/tmp/provider/kick.wav'});
  });
  await waitFor(() => {
    expect(useDAWStore.getState().blocks.some(block => block.name === 'Provider Kick'))
      .toBe(true);
  });
});

test('lists linked, missing, and warning audio media in the media bin', () => {
  render(<App />);
  openBrowserDock();

  const bin = screen.getByLabelText('Media bin');
  expect(within(bin).getByText('Linked Clip')).toBeInTheDocument();
  expect(within(bin).getByText('Missing Clip')).toBeInTheDocument();
  expect(within(bin).getByText('Warning Clip')).toBeInTheDocument();
  expect(within(bin).queryByText('Linked Sibling')).not.toBeInTheDocument();
  expect(within(bin).getByText('2 clips - Project-managed')).toBeInTheDocument();
  expect(within(bin).getByText('Linked')).toBeInTheDocument();
  expect(within(bin).getByText('Missing')).toBeInTheDocument();
  expect(within(bin).getByText('Warning')).toBeInTheDocument();
  expect(within(bin).getByText('44100 Hz')).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Recover Offline'})).toBeEnabled();
});

test('selects and reveals media bin items through the media bridge', () => {
  render(<App />);
  openBrowserDock();

  fireEvent.click(screen.getByRole('button', {name: 'Select media Warning Clip'}));
  expect(useDAWStore.getState().selectedBlockId).toBe('clip-warning');

  fireEvent.click(screen.getByRole('button', {name: 'Reveal media Linked Clip'}));
  expect(revealAudioMedia).toHaveBeenCalledWith({path: '/tmp/imports/linked.wav'});
  expect(screen.getByRole('button', {name: 'Reveal media Missing Clip'})).toBeDisabled();
  expect(screen.getByRole('button', {name: 'Relink media Missing Clip'})).toBeInTheDocument();
});

test('renames a media source from the media bin', () => {
  const promptSpy = jest.spyOn(window, 'prompt').mockReturnValue('Lead Vocal Source');
  render(<App />);
  openBrowserDock();

  fireEvent.click(screen.getByRole('button', {name: 'Rename media Linked Clip'}));

  expect(promptSpy).toHaveBeenCalledWith('Rename media source', 'Linked Clip');
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-linked'))
    .toMatchObject({mediaSourceName: 'Lead Vocal Source'});
  expect(useDAWStore.getState().blocks.find(block => block.id === 'clip-linked-sibling'))
    .toMatchObject({mediaSourceName: 'Lead Vocal Source'});
  expect(screen.getByText('Lead Vocal Source')).toBeInTheDocument();

  promptSpy.mockRestore();
});
