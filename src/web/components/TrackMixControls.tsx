import React from 'react';

import {
  AUTOMATION_MODES,
  findAutomationPointAtBeat,
  normalizeAutomationMode,
  type AutomationMode,
  type AutomationTargetType,
} from '../../automation/trackAutomation';
import {
  MAX_TRACK_GAIN_DB,
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
  MIN_TRACK_GAIN_DB,
  MIN_TRACK_PAN,
  MIN_TRACK_VOLUME_DB,
  normalizeTrackMix,
} from '../../music/trackMix';
import type {DAWTrack} from '../../store/useDAWStore';
import {TrackLevelMeter} from './LevelMeter';

type AutomationControlTarget = {
  id: string;
  label: string;
  targetType: AutomationTargetType;
  parameterId: string;
  defaultValue: (mix: {volumeDb: number; pan: number}) => number;
};

const AUTOMATION_CONTROL_TARGETS: AutomationControlTarget[] = [
  {id: 'track:volumeDb', label: 'Volume', targetType: 'track', parameterId: 'volumeDb', defaultValue: mix => mix.volumeDb},
  {id: 'track:pan', label: 'Pan', targetType: 'track', parameterId: 'pan', defaultValue: mix => mix.pan},
  {id: 'fx:eq.dryWet', label: 'EQ Mix', targetType: 'fx', parameterId: 'eq.dryWet', defaultValue: () => 1},
  {id: 'fx:compressor.threshold', label: 'Comp Threshold', targetType: 'fx', parameterId: 'compressor.threshold', defaultValue: () => 0.5},
  {id: 'instrument:filter.cutoff', label: 'Instrument Cutoff', targetType: 'instrument', parameterId: 'filter.cutoff', defaultValue: () => 0.5},
  {id: 'instrument:filter.resonance', label: 'Instrument Resonance', targetType: 'instrument', parameterId: 'filter.resonance', defaultValue: () => 0.2},
];

type TrackMixControlsProps = {
  track: DAWTrack;
  onInputMonitoringChange: (trackId: string, enabled: boolean) => void;
  onAutomationModeChange: (trackId: string, mode: AutomationMode) => void;
  onAutomationPointSet?: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
    value: number,
  ) => void;
  onAutomationPointRemove?: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
  ) => void;
  onAutomationPointCapture?: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
  ) => void;
  playheadBeat?: number;
  isPlaying?: boolean;
  onVolumeChange: (trackId: string, volumeDb: number) => void;
  onPanChange: (trackId: string, pan: number) => void;
  onGainChange: (trackId: string, gainDb: number) => void;
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

function stopRowSelection(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

function automationBeatLabel(beat: number): string {
  return `Beat ${Math.round(beat * 100) / 100}`;
}

function automationPointCount(track: DAWTrack): number {
  return (track.automationLanes ?? []).reduce(
    (count, lane) => count + lane.points.length,
    0,
  );
}

export function TrackMixControls({
  track,
  onInputMonitoringChange,
  onAutomationModeChange,
  onAutomationPointSet,
  onAutomationPointRemove,
  onAutomationPointCapture,
  playheadBeat = 0,
  isPlaying = false,
  onVolumeChange,
  onPanChange,
  onGainChange,
}: TrackMixControlsProps) {
  const mix = normalizeTrackMix(track);
  const automationMode = normalizeAutomationMode(track.automationMode);
  const automationBeat = Math.max(0, Math.round(playheadBeat * 1000) / 1000);
  const canEditAutomation = Boolean(onAutomationPointSet && onAutomationPointRemove);
  const canCaptureAutomation = automationMode !== 'read';
  const canCaptureTouchedAutomation = isPlaying && canCaptureAutomation && Boolean(onAutomationPointCapture);
  const [automationTargetId, setAutomationTargetId] = React.useState(
    AUTOMATION_CONTROL_TARGETS[0]!.id,
  );
  const [automationValues, setAutomationValues] = React.useState<Record<string, number>>({});
  const automationTarget =
    AUTOMATION_CONTROL_TARGETS.find(target => target.id === automationTargetId) ??
    AUTOMATION_CONTROL_TARGETS[0]!;
  const automationValue =
    automationValues[automationTarget.id] ?? automationTarget.defaultValue(mix);
  const selectedAutomationPoint = findAutomationPointAtBeat(track.automationLanes, automationTarget, automationBeat);
  const finiteAutomationValue = Number.isFinite(automationValue)
    ? automationValue
    : automationTarget.defaultValue(mix);
  const captureTouchedAutomation = (parameterId: string) => {
    if (canCaptureTouchedAutomation) {
      onAutomationPointCapture?.(track.id, 'track', parameterId, automationBeat);
    }
  };

  return (
    <div
      className="track-mix-controls"
      onClick={stopRowSelection}
      onPointerDown={stopRowSelection}>
      <label className="track-mix-row">
        <span className="track-mix-label">Vol</span>
        <output className="track-mix-value">{dbLabel(mix.volumeDb)}</output>
        <input
          aria-label={`Volume for ${track.name}`}
          data-copilot-id={`track:${track.id}:volume`}
          type="range"
          min={MIN_TRACK_VOLUME_DB}
          max={MAX_TRACK_VOLUME_DB}
          step={0.5}
          value={mix.volumeDb}
          onChange={event => {
            onVolumeChange(track.id, Number(event.currentTarget.value));
            captureTouchedAutomation('volumeDb');
          }}
        />
      </label>
      <label className="track-mix-row">
        <span className="track-mix-label">Pan</span>
        <output className="track-mix-value">{panLabel(mix.pan)}</output>
        <input
          aria-label={`Pan for ${track.name}`}
          data-copilot-id={`track:${track.id}:pan`}
          type="range"
          min={MIN_TRACK_PAN}
          max={MAX_TRACK_PAN}
          step={0.01}
          value={mix.pan}
          onChange={event => {
            onPanChange(track.id, Number(event.currentTarget.value));
            captureTouchedAutomation('pan');
          }}
        />
      </label>
      <label className="track-mix-row">
        <span className="track-mix-label">Trim</span>
        <output className="track-mix-value">{dbLabel(mix.gainDb)}</output>
        <input
          aria-label={`Gain trim for ${track.name}`}
          data-copilot-id={`track:${track.id}:gain-trim`}
          type="range"
          min={MIN_TRACK_GAIN_DB}
          max={MAX_TRACK_GAIN_DB}
          step={0.5}
          value={mix.gainDb}
          onChange={event => onGainChange(track.id, Number(event.currentTarget.value))}
        />
      </label>
      {track.type === 'voice_audio' ? (
        <label className="track-mix-row monitor-row">
          <span className="track-mix-label">Mon</span>
          <input
            aria-label={`Input monitoring for ${track.name}`}
            data-copilot-id={`track:${track.id}:input-monitor-detail`}
            type="checkbox"
            disabled={track.isFrozen === true}
            checked={track.isInputMonitoringEnabled === true}
            onChange={event => onInputMonitoringChange(track.id, event.currentTarget.checked)}
          />
        </label>
      ) : null}
      <label className="track-mix-row automation-row">
        <span className="track-mix-label">Auto</span>
        <select
          aria-label={`Automation mode for ${track.name}`}
          data-copilot-id={`track:${track.id}:automation-mode`}
          value={automationMode}
          onChange={event =>
            onAutomationModeChange(track.id, normalizeAutomationMode(event.currentTarget.value))
          }>
          {AUTOMATION_MODES.map(mode => (
            <option key={mode} value={mode}>{mode[0]!.toUpperCase()}</option>
          ))}
        </select>
      </label>
      {canEditAutomation ? (
        <div className="track-automation-points" aria-label={`Automation points for ${track.name}`}>
          <span>{automationBeatLabel(automationBeat)}</span>
          <select
            aria-label={`Automation target for ${track.name}`}
            data-copilot-id={`track:${track.id}:automation-target`}
            value={automationTarget.id}
            onChange={event => setAutomationTargetId(event.currentTarget.value)}>
            {AUTOMATION_CONTROL_TARGETS.map(target => (
              <option key={target.id} value={target.id}>{target.label}</option>
            ))}
          </select>
          <input
            aria-label={`Automation value for ${track.name}`}
            data-copilot-id={`track:${track.id}:automation-value`}
            type="number"
            step={0.01}
            value={finiteAutomationValue}
            onChange={event => {
              const nextValue = Number(event.currentTarget.value);
              setAutomationValues(values => ({
                ...values,
                [automationTarget.id]: nextValue,
              }));
            }}
          />
          <button
            type="button"
            aria-label={`Write ${automationTarget.label} automation point for ${track.name}`}
            data-copilot-id={`track:${track.id}:automation-write`}
            onClick={() =>
              onAutomationPointSet?.(
                track.id,
                automationTarget.targetType,
                automationTarget.parameterId,
                automationBeat,
                finiteAutomationValue,
              )
            }>
            W
          </button>
          <button
            type="button"
            aria-label={`Clear ${automationTarget.label} automation point for ${track.name}`}
            data-copilot-id={`track:${track.id}:automation-clear`}
            disabled={!selectedAutomationPoint}
            onClick={() =>
              onAutomationPointRemove?.(
                track.id,
                automationTarget.targetType,
                automationTarget.parameterId,
                automationBeat,
              )
            }>
            C
          </button>
          {onAutomationPointCapture ? (
            <button
              type="button"
              aria-label={`Capture ${automationTarget.label} automation point for ${track.name}`}
              data-copilot-id={`track:${track.id}:automation-capture`}
              disabled={!canCaptureAutomation}
              onClick={() =>
                onAutomationPointCapture(
                  track.id,
                  automationTarget.targetType,
                  automationTarget.parameterId,
                  automationBeat,
                )
              }>
              Cap
            </button>
          ) : null}
          <output
            aria-label={`Automation point count for ${track.name}`}
            data-copilot-id={`track:${track.id}:automation-point-count`}>
            {automationPointCount(track)} pts
          </output>
        </div>
      ) : null}
      <TrackLevelMeter trackId={track.id} label={`Native level meter for ${track.name}`} />
    </div>
  );
}
