import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../src/music/midiFileExport';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const importAudio = jest.fn();
const importMidi = jest.fn();
const relinkAudio = jest.fn();

function midiFixtureBase64(): string {
  const snapshot = emptyProjectSnapshot();
  snapshot.tracks = [{
    id: 'track-midi',
    name: 'Drop Lead',
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
    name: 'Drop Lead',
    startBeat: 0,
    lengthBeats: 2,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  }];
  return midiBytesToBase64(midiFileBytesFromSnapshot(snapshot)!);
}

function droppedFile(name: string, path: string): File {
  const file = new File(['fixture'], name);
  Object.defineProperty(file, 'path', {value: path});
  return file;
}

async function dropMedia(file: File): Promise<void> {
  await act(async () => {
    fireEvent.drop(screen.getByLabelText('Media drop target'), {
      dataTransfer: {files: [file]},
    });
    await Promise.resolve();
  });
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
    playheadBeat: 8,
    playheadSeconds: 4,
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
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {lengthBeats: 3, durationSeconds: 1.5, waveformPeaks: [0.1, 0.9]},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  importAudio.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/drop-loop.wav',
    absolutePath: '/tmp/imports/drop-loop.wav',
    relativePath: 'imports/drop-loop.wav',
    name: 'drop-loop',
  });
  importMidi.mockResolvedValue({
    ok: true,
    originalPath: '/Users/me/drop-lead.mid',
    base64: midiFixtureBase64(),
    name: 'drop-lead',
  });
  relinkAudio.mockResolvedValue({ok: false, canceled: true, error: 'unused'});
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
  window.mediaImport = {importAudio, importMidi, relinkAudio};
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  importAudio.mockReset();
  importMidi.mockReset();
  relinkAudio.mockReset();
  delete window.mediaImport;
});

test('imports a dropped audio file through the Electron path request', async () => {
  render(<App />);

  await dropMedia(droppedFile('drop-loop.wav', '/Users/me/drop-loop.wav'));

  expect(importAudio).toHaveBeenCalledWith({path: '/Users/me/drop-loop.wav'});
  expect(importMidi).not.toHaveBeenCalled();
  expect(sendCommand).toHaveBeenCalledWith(
    'analyze_audio_file',
    JSON.stringify({absoluteAudioFilePath: '/tmp/imports/drop-loop.wav'}),
  );
  expect(useDAWStore.getState().blocks[0]).toMatchObject({
    name: 'drop-loop',
    startBeat: 8,
    lengthBeats: 3,
    audioFilePath: 'imports/drop-loop.wav',
  });
});

test('imports a dropped MIDI file and syncs the created track before the clip', async () => {
  render(<App />);

  await dropMedia(droppedFile('drop-lead.mid', '/Users/me/drop-lead.mid'));

  expect(importMidi).toHaveBeenCalledWith({path: '/Users/me/drop-lead.mid'});
  expect(importAudio).not.toHaveBeenCalled();
  const state = useDAWStore.getState();
  expect(state.tracks[0]).toMatchObject({type: 'software_instrument', name: 'Drop Lead'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[0]?.id,
    startBeat: 8,
    notes: [{note: 67, velocity: 100, startBeat: 0, lengthBeats: 2}],
  });
  const setTracksIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'setTracks');
  const upsertMidiIndex = sendCommand.mock.calls.findIndex(([command]) => command === 'upsert_midi_clip');
  expect(upsertMidiIndex).toBeGreaterThan(setTracksIndex);
});
