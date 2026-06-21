import React from 'react';
import {act, cleanup, render} from '@testing-library/react';

import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../src/native/NativeAudioEngine';
import {useAudioImport} from '../src/hooks/useAudioImport';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
  sendNativeAudioCommandAsync: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
const mockedSendAsync = sendNativeAudioCommandAsync as jest.MockedFunction<
  typeof sendNativeAudioCommandAsync
>;
const importAudio = jest.fn();

let importFromHarness: ReturnType<typeof useAudioImport>['importAudioFile'] = async () => null;

function Harness() {
  importFromHarness = useAudioImport().importAudioFile;
  return null;
}

function existingVoiceTrack(): DAWTrack {
  return {
    id: 'existing-voice',
    name: 'Voice 1',
    isMuted: false,
    isSolo: false,
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_audio',
    isRecordArmed: false,
    isInputMonitoringEnabled: false,
    isLocked: false,
  };
}

function audioImportResponse(sourcePath = '/Users/me/loop.wav') {
  const fileName = sourcePath.split(/[\\/]/).pop() ?? 'loop.wav';
  const stem = fileName.replace(/\.[^.]+$/, '') || 'loop';
  return {
    ok: true,
    originalPath: sourcePath,
    absolutePath: `/tmp/imports/${fileName}`,
    relativePath: `imports/${fileName}`,
    name: stem,
  };
}

beforeEach(() => {
  mockedSend.mockImplementation(command => {
    if (command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {sampleRate: 48000}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  mockedSendAsync.mockImplementation(async (command, payload) => {
    if (command === 'prepare_audio_file_for_playback') {
      const source = payload as {absoluteAudioFilePath?: string; relativeAudioFilePath?: string};
      return JSON.stringify({
        ok: true,
        data: {
          absoluteAudioFilePath: source.absoluteAudioFilePath?.replace(/\.mp3$/i, '.wav'),
          relativeAudioFilePath: source.relativeAudioFilePath?.replace(/\.mp3$/i, '.wav'),
          converted: true,
        },
      });
    }
    if (command === 'analyze_audio_file') {
      return JSON.stringify({
        ok: true,
        data: {lengthBeats: 4, durationSeconds: 2, waveformPeaks: [0.2, 0.7]},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  importAudio.mockImplementation(async (request?: {path?: string}) =>
    audioImportResponse(request?.path),
  );
  window.mediaImport = {importAudio};
  useDAWStore.setState({
    tracks: [existingVoiceTrack()],
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: 'existing-voice',
    playheadBeat: 4,
    syncSource: 'ui',
  });
});

afterEach(() => {
  cleanup();
  mockedSend.mockReset();
  mockedSendAsync.mockReset();
  importAudio.mockReset();
  delete window.mediaImport;
});

test('creates a fresh audio track for each new audio import', async () => {
  render(<Harness />);

  await act(async () => {
    await importFromHarness({path: '/Users/me/loop.wav'});
  });

  const state = useDAWStore.getState();
  expect(state.tracks).toHaveLength(2);
  expect(state.tracks[0]).toMatchObject({id: 'existing-voice', type: 'voice_audio'});
  expect(state.tracks[1]).toMatchObject({type: 'voice_audio'});
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[1]?.id,
    audioFilePath: 'imports/loop.wav',
    startBeat: 4,
  });
});

test('imports a second audio file without forcing an audio-device refresh', async () => {
  render(<Harness />);

  await act(async () => {
    await importFromHarness({path: '/Users/me/loop-a.wav'});
    await importFromHarness({path: '/Users/me/loop-b.wav'});
  });

  const state = useDAWStore.getState();
  expect(state.tracks).toHaveLength(3);
  expect(state.blocks).toHaveLength(2);
  expect(state.blocks.map(block => block.trackId)).toEqual([
    state.tracks[1]?.id,
    state.tracks[2]?.id,
  ]);
  expect(state.blocks.map(block => block.audioFilePath)).toEqual([
    'imports/loop-a.wav',
    'imports/loop-b.wav',
  ]);
  expect(mockedSend).not.toHaveBeenCalledWith('analyze_audio_file', expect.anything());
  expect(mockedSendAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    expect.objectContaining({absoluteAudioFilePath: '/tmp/imports/loop-a.wav'}),
  );
  expect(mockedSend).not.toHaveBeenCalledWith('refresh_audio_device', expect.anything());
});

test('prepares compressed imports as wav before creating the audio track', async () => {
  render(<Harness />);

  await act(async () => {
    await importFromHarness({path: '/Users/me/vocal.mp3'});
  });

  expect(mockedSendAsync).toHaveBeenCalledWith(
    'prepare_audio_file_for_playback',
    expect.objectContaining({
      absoluteAudioFilePath: '/tmp/imports/vocal.mp3',
      relativeAudioFilePath: 'imports/vocal.mp3',
    }),
  );
  expect(mockedSendAsync).toHaveBeenCalledWith(
    'analyze_audio_file',
    expect.objectContaining({absoluteAudioFilePath: '/tmp/imports/vocal.wav'}),
  );

  const state = useDAWStore.getState();
  expect(state.tracks).toHaveLength(2);
  expect(state.blocks[0]).toMatchObject({
    trackId: state.tracks[1]?.id,
    audioFilePath: 'imports/vocal.wav',
    absoluteAudioFilePath: '/tmp/imports/vocal.wav',
    startBeat: 4,
  });
});
