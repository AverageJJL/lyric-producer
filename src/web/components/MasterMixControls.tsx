import React from 'react';

import {
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
  MIN_TRACK_PAN,
  MIN_TRACK_VOLUME_DB,
} from '../../music/trackMix';
import {MasterLevelMeter} from './LevelMeter';

type MasterMixControlsProps = {
  volumeDb: number;
  pan: number;
  onVolumeChange: (volumeDb: number) => void;
  onPanChange: (pan: number) => void;
};

function dbLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded} dB`;
}

function panLabel(value: number): string {
  if (Math.abs(value) < 0.01) {
    return 'C';
  }
  return `${value < 0 ? 'L' : 'R'}${Math.round(Math.abs(value) * 100)}`;
}

export function MasterMixControls({
  volumeDb,
  pan,
  onVolumeChange,
  onPanChange,
}: MasterMixControlsProps) {
  return (
    <section className="inspector-card master-mix-panel" aria-label="Master mixer">
      <div className="inspector-title">
        <span>Master</span>
        <strong>{dbLabel(volumeDb)}</strong>
      </div>
      <MasterLevelMeter />
      <label className="master-mix-row">
        <span>Volume</span>
        <output>{dbLabel(volumeDb)}</output>
        <input
          aria-label="Master volume"
          type="range"
          min={MIN_TRACK_VOLUME_DB}
          max={MAX_TRACK_VOLUME_DB}
          step={0.5}
          value={volumeDb}
          onChange={event => onVolumeChange(Number(event.currentTarget.value))}
        />
      </label>
      <label className="master-mix-row">
        <span>Pan</span>
        <output>{panLabel(pan)}</output>
        <input
          aria-label="Master pan"
          type="range"
          min={MIN_TRACK_PAN}
          max={MAX_TRACK_PAN}
          step={0.01}
          value={pan}
          onChange={event => onPanChange(Number(event.currentTarget.value))}
        />
      </label>
    </section>
  );
}
