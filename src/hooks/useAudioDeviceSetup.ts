import {useCallback, useEffect, useState} from 'react';

import {sendNativeAudioCommand} from '../native/NativeAudioEngine';

export type AudioOutputDevice = {
  type: string;
  name: string;
};

export type AudioInputDevice = AudioOutputDevice;

export type AudioDeviceStatus = {
  deviceName: string;
  sampleRate: number;
  blockSize: number;
  availableSampleRates: number[];
  availableBufferSizes: number[];
  inputLatencyMs: number;
  outputLatencyMs: number;
  preferredOutputDeviceName: string;
  preferredInputDeviceName: string;
  currentInputDeviceName: string;
};

function parseResponse(response: string | null): Record<string, unknown> | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    return parsed.ok === true ? parsed.data ?? null : null;
  } catch {
    return null;
  }
}

function outputDevicesFrom(data: Record<string, unknown> | null): AudioOutputDevice[] {
  const raw = data?.outputs ?? data?.availableOutputDevices;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is AudioOutputDevice =>
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as AudioOutputDevice).name === 'string' &&
    typeof (item as AudioOutputDevice).type === 'string',
  );
}

function inputDevicesFrom(data: Record<string, unknown> | null): AudioInputDevice[] {
  const raw = data?.inputs ?? data?.availableInputDevices;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is AudioInputDevice =>
    Boolean(item) &&
    typeof item === 'object' &&
    typeof (item as AudioInputDevice).name === 'string' &&
    typeof (item as AudioInputDevice).type === 'string',
  );
}

function numberArrayFrom(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item));
}

function statusFrom(data: Record<string, unknown> | null): AudioDeviceStatus {
  return {
    deviceName: typeof data?.deviceName === 'string' ? data.deviceName : 'unavailable',
    sampleRate: typeof data?.sampleRate === 'number' ? data.sampleRate : 0,
    blockSize: typeof data?.blockSize === 'number' ? data.blockSize : 0,
    availableSampleRates: numberArrayFrom(data?.availableSampleRates),
    availableBufferSizes: numberArrayFrom(data?.availableBufferSizes),
    inputLatencyMs: typeof data?.inputLatencyMs === 'number' ? data.inputLatencyMs : 0,
    outputLatencyMs: typeof data?.outputLatencyMs === 'number' ? data.outputLatencyMs : 0,
    preferredOutputDeviceName:
      typeof data?.preferredOutputDeviceName === 'string'
        ? data.preferredOutputDeviceName
        : '',
    preferredInputDeviceName:
      typeof data?.preferredInputDeviceName === 'string'
        ? data.preferredInputDeviceName
        : '',
    currentInputDeviceName:
      typeof data?.currentInputDeviceName === 'string'
        ? data.currentInputDeviceName
        : '',
  };
}

export function useAudioDeviceSetup() {
  const [outputs, setOutputs] = useState<AudioOutputDevice[]>([]);
  const [inputs, setInputs] = useState<AudioInputDevice[]>([]);
  const [status, setStatus] = useState<AudioDeviceStatus>(() => statusFrom(null));
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshDevices = useCallback(() => {
    const listData = parseResponse(sendNativeAudioCommand('list_audio_devices', {}));
    const statusData = parseResponse(sendNativeAudioCommand('engine_status', {}));
    setOutputs(outputDevicesFrom(listData));
    setInputs(inputDevicesFrom(listData));
    setStatus(statusFrom({...statusData, ...listData}));
  }, []);

  const setOutputDevice = useCallback((name: string) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const data = parseResponse(sendNativeAudioCommand('set_output_device', {name}));
      if (!data) {
        setErrorMessage('Could not switch output device.');
        return;
      }
      setStatus(statusFrom(data));
      setOutputs(outputDevicesFrom(data));
      setInputs(inputDevicesFrom(data));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const setInputDevice = useCallback((name: string) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const data = parseResponse(sendNativeAudioCommand('set_input_device', {name}));
      if (!data) {
        setErrorMessage('Could not switch input device.');
        return;
      }
      setStatus(statusFrom(data));
      setOutputs(outputDevicesFrom(data));
      setInputs(inputDevicesFrom(data));
    } finally {
      setIsBusy(false);
    }
  }, []);

  const setDeviceSettings = useCallback((settings: {sampleRate?: number; bufferSize?: number}) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const data = parseResponse(sendNativeAudioCommand('set_audio_device_settings', settings));
      if (!data) {
        setErrorMessage('Could not update audio device settings.');
        return;
      }
      setStatus(statusFrom(data));
      setOutputs(outputDevicesFrom(data));
      setInputs(inputDevicesFrom(data));
    } finally {
      setIsBusy(false);
    }
  }, []);

  useEffect(() => {
    refreshDevices();
  }, [refreshDevices]);

  return {
    outputs,
    inputs,
    status,
    isBusy,
    errorMessage,
    refreshDevices,
    setOutputDevice,
    setInputDevice,
    setDeviceSettings,
  };
}
