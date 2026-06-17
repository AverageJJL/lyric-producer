import React from 'react';
import {act, cleanup, fireEvent, render, screen} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useMixMeterStore} from '../src/store/mixMeterStore';
import {useDAWStore} from '../src/store/useDAWStore';
import {openAudioDock} from './helpers/workspacePanels';
import {App} from '../src/web/App';

const sendCommand = jest.fn();

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
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

const outputs = [
  {type: 'CoreAudio', name: 'Mock Output'},
  {type: 'CoreAudio', name: 'External DAC'},
];
const inputs = [
  {type: 'CoreAudio', name: 'Mock Input'},
  {type: 'CoreAudio', name: 'USB Mic'},
];

beforeEach(() => {
  resetStore();
  useMixMeterStore.getState().clear();
  sendCommand.mockImplementation((command: string) => {
    if (command === 'list_audio_devices') {
      return JSON.stringify({
        ok: true,
        data: {
          outputs,
          inputs,
          preferredOutputDeviceName: 'Mock Output',
          preferredInputDeviceName: 'Mock Input',
          availableSampleRates: [44100, 48000],
          availableBufferSizes: [128, 256, 512],
        },
      });
    }
    if (command === 'set_output_device') {
      return JSON.stringify({
        ok: true,
        data: {
          availableOutputDevices: outputs,
          availableInputDevices: inputs,
          preferredOutputDeviceName: 'External DAC',
          preferredInputDeviceName: 'Mock Input',
          deviceName: 'External DAC',
          sampleRate: 48000,
          blockSize: 128,
          availableSampleRates: [44100, 48000],
          availableBufferSizes: [128, 256, 512],
          inputLatencyMs: 2.5,
          outputLatencyMs: 3.5,
        },
      });
    }
    if (command === 'set_input_device') {
      return JSON.stringify({
        ok: true,
        data: {
          availableOutputDevices: outputs,
          availableInputDevices: inputs,
          preferredOutputDeviceName: 'Mock Output',
          preferredInputDeviceName: 'USB Mic',
          currentInputDeviceName: 'USB Mic',
          deviceName: 'Mock Output',
          sampleRate: 48000,
          blockSize: 256,
          availableSampleRates: [44100, 48000],
          availableBufferSizes: [128, 256, 512],
          inputLatencyMs: 2.5,
          outputLatencyMs: 4,
        },
      });
    }
    if (command === 'set_audio_device_settings') {
      return JSON.stringify({
        ok: true,
        data: {
          availableOutputDevices: outputs,
          availableInputDevices: inputs,
          preferredOutputDeviceName: 'Mock Output',
          preferredInputDeviceName: 'Mock Input',
          currentInputDeviceName: 'Mock Input',
          deviceName: 'Mock Output',
          sampleRate: 44100,
          blockSize: 128,
          availableSampleRates: [44100, 48000],
          availableBufferSizes: [128, 256, 512],
          inputLatencyMs: 3,
          outputLatencyMs: 5,
        },
      });
    }
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {
          availableOutputDevices: outputs,
          availableInputDevices: inputs,
          preferredOutputDeviceName: 'Mock Output',
          preferredInputDeviceName: 'Mock Input',
          currentInputDeviceName: 'Mock Input',
          deviceName: 'Mock Output',
          sampleRate: 48000,
          blockSize: 256,
          availableSampleRates: [44100, 48000],
          availableBufferSizes: [128, 256, 512],
          inputLatencyMs: 2.5,
          outputLatencyMs: 4,
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {
    sendCommand,
    onEvent: () => () => undefined,
  };
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  useMixMeterStore.getState().clear();
  window.localStorage.clear();
});

test('lists and switches audio output devices', async () => {
  render(<App />);
  openAudioDock();

  const outputSelect = await screen.findByLabelText('Audio output');
  const inputSelect = await screen.findByLabelText('Audio input');
  expect(outputSelect).toHaveValue('Mock Output');
  expect(inputSelect).toHaveValue('Mock Input');
  expect(screen.getAllByText('Mock Input').length).toBeGreaterThan(0);
  expect(screen.getAllByText('48000 Hz').length).toBeGreaterThan(0);
  expect(screen.getAllByText('256').length).toBeGreaterThan(0);
  expect(screen.getByText('6.5 ms')).toBeInTheDocument();

  await act(async () => {
    fireEvent.change(outputSelect, {target: {value: 'External DAC'}});
  });

  expect(sendCommand).toHaveBeenCalledWith(
    'set_output_device',
    JSON.stringify({name: 'External DAC'}),
  );
  expect(outputSelect).toHaveValue('External DAC');

  await act(async () => {
    fireEvent.change(inputSelect, {target: {value: 'USB Mic'}});
  });

  expect(sendCommand).toHaveBeenCalledWith(
    'set_input_device',
    JSON.stringify({name: 'USB Mic'}),
  );
  expect(inputSelect).toHaveValue('USB Mic');

  await act(async () => {
    fireEvent.change(screen.getByLabelText('Sample rate'), {target: {value: '44100'}});
  });

  expect(sendCommand).toHaveBeenCalledWith(
    'set_audio_device_settings',
    JSON.stringify({sampleRate: 44100}),
  );
  expect(screen.getByLabelText('Sample rate')).toHaveValue('44100');

  await act(async () => {
    fireEvent.change(screen.getByLabelText('Buffer size'), {target: {value: '128'}});
  });

  expect(sendCommand).toHaveBeenCalledWith(
    'set_audio_device_settings',
    JSON.stringify({bufferSize: 128}),
  );
  expect(screen.getByLabelText('Buffer size')).toHaveValue('128');
  expect(screen.getByText('8.0 ms')).toBeInTheDocument();
});

test('renders native input meter state in the audio device panel', async () => {
  useMixMeterStore.getState().applySnapshot({
    schemaVersion: 1,
    source: 'tracktion_level_measurer',
    timestampMs: 1,
    input: {
      active: true,
      deviceName: 'USB Mic',
      peak: {db: -18, linear: 0.12},
      peakHold: {db: -9, linear: 0.35},
      clipping: false,
      channels: [],
    },
    master: {
      peak: {db: -100, linear: 0},
      peakHold: {db: -100, linear: 0},
      clipping: false,
      channels: [],
    },
    tracks: {},
  });

  render(<App />);
  openAudioDock();

  expect(await screen.findByText('Input live')).toBeInTheDocument();
  expect(screen.getByRole('meter', {name: 'Native input level meter'}))
    .toHaveAttribute('aria-valuenow', '-18');
});
