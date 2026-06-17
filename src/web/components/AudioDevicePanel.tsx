import React from 'react';

import type {
  AudioDeviceStatus,
  AudioInputDevice,
  AudioOutputDevice,
} from '../../hooks/useAudioDeviceSetup';
import {InputLevelMeter, InputMeterStatus} from './LevelMeter';

type AudioDevicePanelProps = {
  outputs: AudioOutputDevice[];
  inputs: AudioInputDevice[];
  status: AudioDeviceStatus;
  isBusy: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onOutputChange: (name: string) => void;
  onInputChange: (name: string) => void;
  onSettingsChange: (settings: {sampleRate?: number; bufferSize?: number}) => void;
};

function rateLabel(sampleRate: number): string {
  return sampleRate > 0 ? `${Math.round(sampleRate)} Hz` : 'Unavailable';
}

function latencyLabel(inputMs: number, outputMs: number): string {
  const total = inputMs + outputMs;
  return total > 0 ? `${total.toFixed(1)} ms` : 'Unavailable';
}

function optionValues(values: number[], current: number): number[] {
  const merged = current > 0 ? [...values, current] : values;
  return [...new Set(merged)].sort((left, right) => left - right);
}

export function AudioDevicePanel({
  outputs,
  inputs,
  status,
  isBusy,
  errorMessage,
  onRefresh,
  onOutputChange,
  onInputChange,
  onSettingsChange,
}: AudioDevicePanelProps) {
  const selectedOutput = status.preferredOutputDeviceName || status.deviceName;
  const selectedInput = status.preferredInputDeviceName || '';
  const sampleRates = optionValues(status.availableSampleRates, status.sampleRate);
  const bufferSizes = optionValues(status.availableBufferSizes, status.blockSize);

  return (
    <section className="inspector-card audio-device-panel" aria-label="Audio device setup">
      <div className="inspector-title">
        <span>Audio</span>
        <button type="button" onClick={onRefresh} disabled={isBusy}>Scan</button>
      </div>
      <select
        aria-label="Audio output"
        value={selectedOutput}
        disabled={isBusy || outputs.length === 0}
        onChange={event => onOutputChange(event.currentTarget.value)}>
        {outputs.length === 0 ? <option value={selectedOutput}>No outputs</option> : null}
        {outputs.map(output => (
          <option key={`${output.type}-${output.name}`} value={output.name}>
            {output.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Audio input"
        value={selectedInput}
        disabled={isBusy || inputs.length === 0}
        onChange={event => onInputChange(event.currentTarget.value)}>
        {inputs.length === 0 ? (
          <option value={selectedInput}>No inputs</option>
        ) : (
          <option value="">Automatic input</option>
        )}
        {inputs.map(input => (
          <option key={`${input.type}-${input.name}`} value={input.name}>
            {input.name}
          </option>
        ))}
      </select>
      <div className="audio-device-settings">
        <select
          aria-label="Sample rate"
          value={status.sampleRate || ''}
          disabled={isBusy || sampleRates.length === 0}
          onChange={event => onSettingsChange({sampleRate: Number(event.currentTarget.value)})}>
          {sampleRates.length === 0 ? <option value="">No rates</option> : null}
          {sampleRates.map(sampleRate => (
            <option key={sampleRate} value={sampleRate}>
              {rateLabel(sampleRate)}
            </option>
          ))}
        </select>
        <select
          aria-label="Buffer size"
          value={status.blockSize || ''}
          disabled={isBusy || bufferSizes.length === 0}
          onChange={event => onSettingsChange({bufferSize: Number(event.currentTarget.value)})}>
          {bufferSizes.length === 0 ? <option value="">No buffers</option> : null}
          {bufferSizes.map(bufferSize => (
            <option key={bufferSize} value={bufferSize}>
              {bufferSize} samples
            </option>
          ))}
        </select>
      </div>
      <dl>
        <div>
          <dt>Meter</dt>
          <dd><InputMeterStatus /></dd>
        </div>
        <div>
          <dt>Input</dt>
          <dd>{status.currentInputDeviceName || status.preferredInputDeviceName || 'Automatic'}</dd>
        </div>
        <div>
          <dt>Rate</dt>
          <dd>{rateLabel(status.sampleRate)}</dd>
        </div>
        <div>
          <dt>Buffer</dt>
          <dd>{status.blockSize > 0 ? status.blockSize : 'Unavailable'}</dd>
        </div>
        <div>
          <dt>Latency</dt>
          <dd>{latencyLabel(status.inputLatencyMs, status.outputLatencyMs)}</dd>
        </div>
      </dl>
      <InputLevelMeter />
      {errorMessage ? <p className="audio-device-error">{errorMessage}</p> : null}
    </section>
  );
}
