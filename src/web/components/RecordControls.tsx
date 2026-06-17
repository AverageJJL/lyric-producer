import React from 'react';

import {
  RECORDING_COUNT_IN_OPTIONS,
  RECORDING_LATENCY_COMPENSATION_MS_OPTIONS,
  RECORDING_PRE_ROLL_OPTIONS,
  normalizeRecordingCountInBeats,
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingPreRollBeats,
  type RecordingCountInBeats,
  type RecordingLatencyCompensationMs,
  type RecordingPreRollBeats,
} from '../../transport/recordingPreferences';

type RecordControlsProps = {
  isRecording?: boolean;
  isLeadInPending?: boolean;
  countInBeats?: RecordingCountInBeats;
  preRollBeats?: RecordingPreRollBeats;
  latencyCompensationMs?: RecordingLatencyCompensationMs;
  isPunchEnabled?: boolean;
  isLoopEnabled?: boolean;
  canPunchRecord?: boolean;
  canLoopRecord?: boolean;
  trackLabel?: string;
  recordingLabel?: string;
  leadInLabel?: string;
  errorMessage: string | null;
  onCountInChange?: (beats: RecordingCountInBeats) => void;
  onPreRollChange?: (beats: RecordingPreRollBeats) => void;
  onLatencyCompensationChange?: (milliseconds: RecordingLatencyCompensationMs) => void;
  onPunchEnabledChange?: (enabled: boolean) => void;
  onLoopEnabledChange?: (enabled: boolean) => void;
};

export function RecordControls({
  isRecording,
  isLeadInPending,
  countInBeats,
  preRollBeats,
  latencyCompensationMs,
  isPunchEnabled,
  isLoopEnabled,
  canPunchRecord,
  canLoopRecord,
  trackLabel,
  recordingLabel,
  leadInLabel,
  errorMessage,
  onCountInChange,
  onPreRollChange,
  onLatencyCompensationChange,
  onPunchEnabledChange,
  onLoopEnabledChange,
}: RecordControlsProps) {
  const hasPreferenceControls = trackLabel !== undefined && countInBeats !== undefined &&
    preRollBeats !== undefined && latencyCompensationMs !== undefined;
  const statusText = leadInLabel ?? recordingLabel ?? (hasPreferenceControls ? `Armed: ${trackLabel}` : undefined);

  if (!hasPreferenceControls) {
    if (!statusText && !errorMessage) {
      return null;
    }
    return (
      <div className="record-controls record-controls-status">
        {statusText ? <span className="record-status">{statusText}</span> : null}
        {errorMessage ? <span className="record-error">{errorMessage}</span> : null}
      </div>
    );
  }

  const controlsDisabled = Boolean(isRecording || isLeadInPending);
  const punchDisabled = controlsDisabled || !canPunchRecord;
  const loopDisabled = controlsDisabled || !canLoopRecord;

  return (
    <div className="record-controls record-controls-preferences">
      <div className="record-lead-in-controls">
        <label className="record-count-in">
          <span>Count</span>
          <select
            aria-label="Recording count-in"
            disabled={controlsDisabled}
            value={countInBeats}
            onChange={event =>
              onCountInChange?.(normalizeRecordingCountInBeats(Number(event.currentTarget.value)))
            }>
            {RECORDING_COUNT_IN_OPTIONS.map(beats => (
              <option key={beats} value={beats}>
                {beats === 0 ? 'Off' : `${beats} beats`}
              </option>
            ))}
          </select>
        </label>
        <label className="record-count-in">
          <span>Pre</span>
          <select
            aria-label="Recording pre-roll"
            disabled={controlsDisabled}
            value={preRollBeats}
            onChange={event =>
              onPreRollChange?.(normalizeRecordingPreRollBeats(Number(event.currentTarget.value)))
            }>
            {RECORDING_PRE_ROLL_OPTIONS.map(beats => (
              <option key={beats} value={beats}>
                {beats === 0 ? 'Off' : `${beats} beats`}
              </option>
            ))}
          </select>
        </label>
        <label className="record-count-in">
          <span>Comp</span>
          <select
            aria-label="Recording latency compensation"
            disabled={controlsDisabled}
            value={latencyCompensationMs}
            onChange={event =>
              onLatencyCompensationChange?.(
                normalizeRecordingLatencyCompensationMs(Number(event.currentTarget.value)),
              )
            }>
            {RECORDING_LATENCY_COMPENSATION_MS_OPTIONS.map(milliseconds => (
              <option key={milliseconds} value={milliseconds}>
                {milliseconds < 0 ? 'Auto' : milliseconds === 0 ? 'Off' : `${milliseconds} ms`}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="record-punch-toggle">
        <input
          type="checkbox"
          aria-label="Punch recording"
          checked={isPunchEnabled && canPunchRecord}
          disabled={punchDisabled}
          onChange={event => onPunchEnabledChange?.(event.currentTarget.checked)}
        />
        <span>Punch</span>
      </label>
      <label className="record-punch-toggle">
        <input
          type="checkbox"
          aria-label="Loop recording"
          checked={isLoopEnabled && canLoopRecord}
          disabled={loopDisabled}
          onChange={event => onLoopEnabledChange?.(event.currentTarget.checked)}
        />
        <span>Loop</span>
      </label>
      <span className="record-status">{statusText}</span>
      {errorMessage ? <span className="record-error">{errorMessage}</span> : null}
    </div>
  );
}
