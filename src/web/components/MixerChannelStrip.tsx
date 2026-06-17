import React from 'react';

import {
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
  MIN_TRACK_PAN,
  MIN_TRACK_VOLUME_DB,
} from '../../music/trackMix';
import type {DAWTrack} from '../../store/useDAWStore';
import {TrackLevelMeter} from './LevelMeter';

type MixerChannelStripProps = {
  track: DAWTrack;
  fxLabels: string[];
  onVolumeChange: (trackId: string, volumeDb: number) => void;
  onPanChange: (trackId: string, pan: number) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onOpenFx: (trackId: string) => void;
};

function dbLabel(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded} dB`;
}

export function MixerChannelStrip({
  track,
  fxLabels,
  onVolumeChange,
  onPanChange,
  onToggleMute,
  onToggleSolo,
  onOpenFx,
}: MixerChannelStripProps) {
  const volumeDb = track.volumeDb ?? 0;
  const pan = track.pan ?? 0;

  return (
    <div className="mixer-channel-strip">
      <header className="mixer-channel-header">
        <span className="mixer-channel-name" title={track.name}>
          {track.name}
        </span>
      </header>
      <div className="mixer-channel-controls">
        <TrackLevelMeter
          trackId={track.id}
          label={`${track.name} level`}
        />
        <label className="mixer-channel-row">
          <span>Vol</span>
          <input
            type="range"
            aria-label={`${track.name} volume`}
            min={MIN_TRACK_VOLUME_DB}
            max={MAX_TRACK_VOLUME_DB}
            step={0.5}
            value={volumeDb}
            onChange={event => onVolumeChange(track.id, Number(event.currentTarget.value))}
          />
          <output>{dbLabel(volumeDb)}</output>
        </label>
        <label className="mixer-channel-row">
          <span>Pan</span>
          <input
            type="range"
            aria-label={`${track.name} pan`}
            min={MIN_TRACK_PAN}
            max={MAX_TRACK_PAN}
            step={0.01}
            value={pan}
            onChange={event => onPanChange(track.id, Number(event.currentTarget.value))}
          />
        </label>
        <div className="mixer-channel-buttons">
          <button
            type="button"
            className={track.isMuted ? 'active' : ''}
            aria-pressed={track.isMuted}
            onClick={() => onToggleMute(track.id)}>
            M
          </button>
          <button
            type="button"
            className={track.isSolo ? 'active' : ''}
            aria-pressed={track.isSolo}
            onClick={() => onToggleSolo(track.id)}>
            S
          </button>
        </div>
      </div>
      <div className="mixer-fx-box">
        <span className="mixer-fx-box-title">FX</span>
        <div className="mixer-fx-labels" aria-label={`FX for ${track.name}`}>
          {fxLabels.length > 0 ? (
            fxLabels.map(label => (
              <span key={label} className="mixer-fx-chip">
                {label}
              </span>
            ))
          ) : (
            <span className="mixer-fx-empty">No FX</span>
          )}
        </div>
        <button
          type="button"
          className="mixer-fx-add"
          aria-label={`Open FX for ${track.name}`}
          onClick={() => onOpenFx(track.id)}>
          +
        </button>
      </div>
    </div>
  );
}
