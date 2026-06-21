import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

// <App /> mounts the Copilot panel, which imports ESM markdown/highlighter deps
// that Jest does not transform in this repo's current test setup.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../src/music/midiFileExport';
import {openBrowserDock} from './helpers/workspacePanels';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
const importAudio = jest.fn();
const importMidi = jest.fn();
const relinkAudio = jest.fn();

function midiFixtureBase64(): string {
  const snapshot = emptyProjectSnapshot();
  snapshot.tracks = [{
    id: 'track-midi',
    name: 'Lead',
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  }];
  snapshot.blocks = [{
    id: 'clip-midi',
    trackId: 'track-midi',
    name: 'Lead',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
  }];
  return midiBytesToBase64(midiFileBytesFromSnapshot(snapshot)!);
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
    playheadBeat: 4,
    playheadSeconds: 2,
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
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {
          lengthBeats: 6,
          durationSeconds: 3,
          waveformPeaks: [0.2, 0.8],
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  sendCommandAsync.mockImplementation((command: string, payloadJson: string) =>
    Promise.resolve(sendCommand(command, payloadJson)),
  );
  importAudio.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/loop.wav',
    absolutePath: '/tmp/imports/loop.wav',
    relativePath: 'imports/loop.wav',
    name: 'loop',
  });
  importMidi.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/lead.mid',
    base64: midiFixtureBase64(),
    name: 'lead',
  });
  relinkAudio.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/replacement.wav',
    absolutePath: '/tmp/imports/replacement.wav',
    relativePath: 'imports/replacement.wav',
    name: 'replacement',
  });
  window.audioEngine = {
    sendCommand,
    sendCommandAsync,
    onEvent: () => () => undefined,
  };
  window.mediaImport = {importAudio, importMidi, relinkAudio};
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  importAudio.mockReset();
  importMidi.mockReset();
  relinkAudio.mockReset();
  window.localStorage.clear();
  delete window.mediaImport;
});

test('imports MIDI and creates a software instrument clip', async () => {
  render(<App />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Import MIDI'}));
  });

  expect(importMidi).toHaveBeenCalledWith();
  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({type: 'software_instrument', name: 'Lead'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[0]?.id,
    name: 'Lead',
    startBeat: 4,
    lengthBeats: 1,
    type: 'midi',
    notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
  });
  expect(state.selectedBlockIds).toEqual([state.blocks[0]?.id]);
  await waitFor(() => {
    expect(sendCommand.mock.calls.some(([command]) => command === 'setTracks')).toBe(true);
    expect(sendCommand.mock.calls.some(([command]) => command === 'upsert_midi_clip')).toBe(true);
  });
  const setTracksIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'setTracks');
  const upsertMidiIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'upsert_midi_clip');
  expect(setTracksIndex).toBeGreaterThanOrEqual(0);
  expect(upsertMidiIndex).toBeGreaterThan(setTracksIndex);
  const setTracksPayload = JSON.parse(sendCommand.mock.calls[setTracksIndex]?.[1] ?? '{}');
  expect(setTracksPayload.tracks[0]).toMatchObject({
    id: state.tracks[0]?.id,
    type: 'software_instrument',
  });
});

test('imports audio through native analysis and creates an audio clip', async () => {
  render(<App />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Import Audio'}));
  });

  expect(importAudio).toHaveBeenCalledWith();
  expect(sendCommandAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/imports/loop.wav'}),
  );

  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({type: 'voice_audio'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[0]?.id,
    name: 'loop',
    startBeat: 4,
    lengthBeats: 6,
    audioFilePath: 'imports/loop.wav',
    absoluteAudioFilePath: '/tmp/imports/loop.wav',
    waveformPeaks: [0.2, 0.8],
  });
});

test('warns when imported audio sample rate differs from the engine rate', async () => {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {
          lengthBeats: 2,
          durationSeconds: 1,
          sampleRate: 44100,
          channelCount: 1,
          fileBytes: 2048,
          waveformPeaks: [0.4],
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  render(<App />);

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Import Audio'}));
  });

  expect(useDAWStore.getState().blocks[0]).toMatchObject({
    sourceSampleRate: 44100,
    sourceChannelCount: 1,
    sourceFileBytes: 2048,
    mediaValidationWarning: 'Source sample rate 44100 Hz differs from device 48000 Hz.',
  });
  openBrowserDock();
  expect(screen.getByText('Source sample rate 44100 Hz differs from device 48000 Hz.'))
    .toBeInTheDocument();
});

test('relinks a selected missing audio clip through native analysis', async () => {
  useDAWStore.setState({
    tracks: [
      {
        id: 'track-audio',
        name: 'Audio 1',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
      },
    ],
    blocks: [
      {
        id: 'missing-clip',
        trackId: 'track-audio',
        name: 'Missing Take',
        startBeat: 0,
        lengthBeats: 8,
        sourceLengthBeats: 8,
        sourceOffsetBeats: 0,
        type: 'audio',
        color: '#64a5ff',
        audioFilePath: 'imports/missing.wav',
        absoluteAudioFilePath: '/tmp/imports/missing.wav',
        isMissingMedia: true,
        missingMediaReason: 'Audio file could not be found.',
      },
    ],
    selectedBlockId: 'missing-clip',
    selectedBlockIds: ['missing-clip'],
    selectedTrackId: 'track-audio',
  });

  render(<App />);
  openBrowserDock();

  await act(async () => {
    fireEvent.click(screen.getByRole('button', {name: 'Relink Audio'}));
  });

  expect(relinkAudio).toHaveBeenCalledWith();
  expect(sendCommandAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/imports/replacement.wav'}),
  );

  const block = useDAWStore.getState().blocks[0];
  expect(block).toMatchObject({
    id: 'missing-clip',
    name: 'Missing Take',
    lengthBeats: 6,
    sourceLengthBeats: 6,
    audioFilePath: 'imports/replacement.wav',
    absoluteAudioFilePath: '/tmp/imports/replacement.wav',
    isMissingMedia: false,
    waveformPeaks: [0.2, 0.8],
  });
});
