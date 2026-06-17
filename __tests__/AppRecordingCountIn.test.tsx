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
    recordingCountInBeats: 4,
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
    nativeCountInActive: false,
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

beforeEach(() => {
  jest.useFakeTimers();
  resetStore();
  installAudioEngineMock();
  fetchMock.mockResolvedValue({ok: true});
  (globalThis as unknown as {fetch: typeof fetchMock}).fetch = fetchMock;
  window.requestAnimationFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16));
  window.cancelAnimationFrame = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));
});

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  sendCommand.mockReset();
  fetchMock.mockReset();
});

test('voice track count-in delays the native audio capture command', () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().setPlayheadBeat(6, {syncTransport: false});
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  sendCommand.mockClear();
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  expect(screen.getByRole('button', {name: 'Cancel recording lead-in'})).toBeInTheDocument();
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_count_in_click')).toBe(true);
  expect(sendCommand.mock.calls.some(([command, payload]) =>
    command === 'transport_play' &&
    typeof payload === 'string' &&
    payload.includes('"isPlaying":true'),
  )).toBe(false);
  expect(useDAWStore.getState().playheadBeat).toBe(6);
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_audio_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":6');
});

test('voice recording after the default count-in finalizes as a visible audio clip', () => {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    if (command === 'stop_audio_recording') {
      return JSON.stringify({
        ok: true,
        data: {
          audioFilePath: 'recordings/default-count-in.wav',
          absoluteAudioFilePath: '/tmp/default-count-in.wav',
          lengthBeats: 2,
          durationSeconds: 1,
          waveformPeaks: [0.2, 0.5],
          peakAmplitude: 0.5,
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  const {container} = render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  act(() => {
    jest.advanceTimersByTime(2000);
  });
  fireEvent.click(screen.getByRole('button', {name: 'Stop recording'}));

  const recorded = useDAWStore.getState().blocks.find(block =>
    block.audioFilePath === 'recordings/default-count-in.wav',
  );
  expect(recorded).toMatchObject({
    type: 'audio',
    name: 'Recorded',
    lengthBeats: 2,
  });
  expect(screen.getAllByText('Recorded').length).toBeGreaterThan(0);
  expect(container.querySelector('.timeline-block')).toHaveStyle({height: '104px'});
});

test('voice track count-in can be canceled without moving the playhead', () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().setPlayheadBeat(10, {syncTransport: false});
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Cancel recording lead-in'}));

  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_count_in_click')).toBe(true);
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);
  expect(useDAWStore.getState().playheadBeat).toBe(10);

  act(() => {
    jest.advanceTimersByTime(2000);
  });

  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);
});

test('voice track count-in native failure aborts before capture', () => {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'start_count_in_click') {
      return JSON.stringify({
        ok: false,
        error: {message: 'Click output unavailable.'},
      });
    }
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  expect(useDAWStore.getState().recordingError).toBe('Click output unavailable.');
  expect(useDAWStore.getState().nativeCountInActive).toBe(false);
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);
});

test('voice track pre-roll starts native transport before native audio capture', () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});
    useDAWStore.getState().setRecordingCountInBeats(0);
    useDAWStore.getState().setRecordingPreRollBeats(4);
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const preRollPlayCall = sendCommand.mock.calls.find(
    ([command, payload]) =>
      command === 'transport_play' &&
      typeof payload === 'string' &&
      payload.includes('"isPlaying":true'),
  );
  expect(preRollPlayCall?.[1]).toContain('"positionBeat":4');
  expect(screen.getByRole('button', {name: 'Cancel recording lead-in'})).toBeInTheDocument();
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_audio_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":8');
});

test('voice track pre-roll can be canceled before capture starts', () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().setPlayheadBeat(8, {syncTransport: false});
    useDAWStore.getState().setRecordingCountInBeats(0);
    useDAWStore.getState().setRecordingPreRollBeats(4);
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Cancel recording lead-in'}));

  const cancelTransportCall = sendCommand.mock.calls.find(
    ([command, payload]) =>
      command === 'transport_play' &&
      typeof payload === 'string' &&
      payload.includes('"isPlaying":false') &&
      payload.includes('"positionBeat":8'),
  );
  expect(cancelTransportCall).toBeTruthy();

  act(() => {
    jest.advanceTimersByTime(2000);
  });

  expect(sendCommand.mock.calls.some(([command]) => command === 'start_audio_recording')).toBe(false);
});

test('voice track punch recording starts and stops at the cycle range', () => {
  render(<App />);

  act(() => {
    useDAWStore.getState().setCycleRange(4, 8, {enable: true});
    useDAWStore.getState().setRecordingCountInBeats(0);
    useDAWStore.getState().setPunchRecordingEnabled(true);
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_audio_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":4');
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1999);
  });
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(false);

  act(() => {
    jest.advanceTimersByTime(1);
  });

  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(true);
});

test('virtual instrument recording starts without record arm when track is selected', () => {
  render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: /Virtual Instrument/}));
  fireEvent.click(screen.getByRole('button', {name: 'Pop Lead'}));
  act(() => {
    useDAWStore.getState().setRecordingCountInBeats(0);
  });
  sendCommand.mockClear();

  const recordButton = screen.getByRole('button', {name: 'Start recording'});
  expect(recordButton).toBeEnabled();

  fireEvent.click(recordButton);

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(useDAWStore.getState().isRecording).toBe(true);
});

test('instrument loop recording starts MIDI capture at the cycle start', () => {
  render(<App />);

  act(() => {
    useDAWStore.setState({
      isCycleEnabled: false,
      cycleStartBeat: 4,
      cycleEndBeat: 8,
      playheadBeat: 12,
      playheadSeconds: 6,
      recordingCountInBeats: 0,
      isLoopRecordingEnabled: true,
    });
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: /Virtual Instrument/}));
  fireEvent.click(screen.getByRole('button', {name: 'Pop Lead'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":4');
  expect(useDAWStore.getState().isCycleEnabled).toBe(true);
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_recording')).toBe(false);
});

test('voice loop recording starts audio capture at the cycle start', () => {
  render(<App />);

  act(() => {
    useDAWStore.setState({
      isCycleEnabled: false,
      cycleStartBeat: 4,
      cycleEndBeat: 8,
      playheadBeat: 12,
      playheadSeconds: 6,
      recordingCountInBeats: 0,
      isLoopRecordingEnabled: true,
    });
  });
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const startCaptureCall = sendCommand.mock.calls.find(
    ([command]) => command === 'start_audio_recording',
  );
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":4');
  expect(useDAWStore.getState().isCycleEnabled).toBe(true);
  expect(sendCommand.mock.calls.some(([command]) => command === 'stop_audio_recording')).toBe(false);
});
