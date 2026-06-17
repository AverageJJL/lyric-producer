import React from 'react';

import type {TrackAutomationCaptureHandler} from '../../hooks/useTrackAutomationCapture';
import {instrumentForTrack} from '../../music/instruments';
import {
  type InstrumentParameterId,
  setNativeInstrumentParameter,
} from '../../native/instrumentParamContract';
import type {DAWTrack} from '../../store/useDAWStore';
import {normalizeAutomationMode} from '../../automation/trackAutomation';

type InstrumentControlPanelProps = {
  track: DAWTrack | null;
  isPlaying?: boolean;
  playheadBeat?: number;
  onAutomationPointCapture?: TrackAutomationCaptureHandler;
};

const PARAMS: Array<{id: InstrumentParameterId; label: string; fallback: number}> = [
  {id: 'filter.cutoff', label: 'Cutoff', fallback: 0.5},
  {id: 'filter.resonance', label: 'Resonance', fallback: 0.2},
];

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function InstrumentControlPanel({
  track,
  isPlaying = false,
  playheadBeat = 0,
  onAutomationPointCapture,
}: InstrumentControlPanelProps) {
  const [values, setValues] = React.useState<Record<InstrumentParameterId, number>>({
    'filter.cutoff': 0.5,
    'filter.resonance': 0.2,
  });

  React.useEffect(() => {
    setValues({'filter.cutoff': 0.5, 'filter.resonance': 0.2});
  }, [track?.id, track?.presetId]);

  if (!track || track.type !== 'software_instrument') {
    return null;
  }

  const instrument = instrumentForTrack(track.type, track.instrumentId);
  if (instrument.nativeInstrument !== 'four_osc') {
    return null;
  }

  const canCapture = isPlaying && normalizeAutomationMode(track.automationMode) !== 'read';
  const handleChange = (parameterId: InstrumentParameterId, value: number) => {
    const nextValue = Math.min(1, Math.max(0, value));
    const applied = setNativeInstrumentParameter({trackId: track.id, parameterId, value: nextValue});
    setValues(previous => ({...previous, [parameterId]: applied?.value ?? nextValue}));
    if (applied && canCapture) {
      onAutomationPointCapture?.(track.id, 'instrument', parameterId, playheadBeat);
    }
  };

  return (
    <section className="inspector-card master-mix-panel" aria-label="Instrument controls">
      <div className="inspector-title">
        <span>Instrument</span>
        <strong>{instrument.label}</strong>
      </div>
      {PARAMS.map(param => {
        const value = values[param.id] ?? param.fallback;
        return (
          <label key={param.id} className="master-mix-row">
            <span>{param.label}</span>
            <output>{percent(value)}</output>
            <input
              aria-label={`Instrument ${param.label.toLowerCase()}`}
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={value}
              onChange={event => handleChange(param.id, Number(event.currentTarget.value))}
            />
          </label>
        );
      })}
    </section>
  );
}
