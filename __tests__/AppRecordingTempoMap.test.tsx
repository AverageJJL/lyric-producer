import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const fetchMock = jest.fn();

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    isMetronomeEnabled: true,
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: 0,
    tracks: [],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
    isRelativeSnapEnabled: false,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
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
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function installAudioEngineMock(): void {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {
    sendCommand,
    onEvent: () => () => undefined,
  };
}

function addArmedVoiceTrack(): void {
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
}

beforeEach(() => {
  jest.useFakeTimers();
  resetStore();
  installAudioEngineMock();
  fetchMock.mockResolvedValue({ok: true});
  (globalThis as unknown as {fetch: typeof fetchMock}).fetch = fetchMock;
  window.requestAnimationFrame =
    window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16));
  window.cancelAnimationFrame = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));
});

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  sendCommand.mockReset();
  fetchMock.mockReset();
});

test('count-in uses the tempo-map tempo at the recording start beat', () => {
  useDAWStore.setState({
    tempoMap: [{id: 'tempo-0_000', beat: 0, bpm: 60, ramp: 'jump'}],
  });
  render(<App />);

  addArmedVoiceTrack();
  fireEvent.change(screen.getByLabelText('Recording count-in'), {target: {value: '4'}});
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  act(() => {
    jest.advanceTimersByTime(3999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(true);
});

test('pre-roll waits for the mapped beat range before starting capture', () => {
  useDAWStore.setState({
    tempoMap: [{id: 'tempo-4_000', beat: 4, bpm: 60, ramp: 'jump'}],
  });
  useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});
  render(<App />);

  addArmedVoiceTrack();
  fireEvent.change(screen.getByLabelText('Recording pre-roll'), {target: {value: '4'}});
  sendCommand.mockClear();
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const preRollPlayCall = sendCommand.mock.calls.find(
    ([command, payload]) =>
      command === 'transport_play' &&
      typeof payload === 'string' &&
      payload.includes('"positionBeat":4') &&
      payload.includes('"positionSeconds":2'),
  );
  expect(preRollPlayCall).toBeTruthy();

  act(() => {
    jest.advanceTimersByTime(3999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(true);
});

test('punch-out waits for the mapped cycle duration before stopping capture', () => {
  useDAWStore.setState({
    tempoMap: [{id: 'tempo-4_000', beat: 4, bpm: 60, ramp: 'jump'}],
  });
  useDAWStore.getState().setCycleRange(4, 8, {enable: true});
  render(<App />);

  addArmedVoiceTrack();
  fireEvent.click(screen.getByLabelText('Punch recording'));
  sendCommand.mockClear();
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(true);
  act(() => {
    jest.advanceTimersByTime(3999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(true);
});
