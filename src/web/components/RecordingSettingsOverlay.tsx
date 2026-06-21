import React, {useEffect, useRef} from 'react';

import type {useRecordingLaunch} from '../../hooks/useRecordingLaunch';
import {useDAWStore} from '../../store/useDAWStore';
import {
  LOOPER_LENGTH_OPTIONS,
  type LooperLengthBars,
  type ProjectPerformanceMode,
} from '../../transport/performanceMode';
import {
  RECORDING_COUNT_IN_OPTIONS,
  RECORDING_LATENCY_COMPENSATION_MS_OPTIONS,
  RECORDING_PRE_ROLL_OPTIONS,
  normalizeRecordingCountInBeats,
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingPreRollBeats,
} from '../../transport/recordingPreferences';

type RecordingLaunch = ReturnType<typeof useRecordingLaunch>;

type RecordingSettingsOverlayProps = {
  recordingLaunch: RecordingLaunch;
  areColoredSectionsHidden?: boolean;
  onColoredSectionsHiddenChange?: (hidden: boolean) => void;
  onClose: () => void;
};

type SettingsCategory = 'recording' | 'project' | 'lyrics';

export function RecordingSettingsOverlay({
  recordingLaunch,
  areColoredSectionsHidden = false,
  onColoredSectionsHiddenChange,
  onClose,
}: RecordingSettingsOverlayProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [selectedCategory, setSelectedCategory] = React.useState<SettingsCategory>('recording');
  const performanceMode = useDAWStore(state => state.performanceMode);
  const looperLengthBars = useDAWStore(state => state.looperLengthBars);
  const setPerformanceMode = useDAWStore(state => state.setPerformanceMode);
  const setLooperLengthBars = useDAWStore(state => state.setLooperLengthBars);
  const controlsDisabled = recordingLaunch.isLeadInPending;
  const punchDisabled = controlsDisabled || !recordingLaunch.canPunchRecord;
  const isRecordingSettings = selectedCategory === 'recording';
  const title = isRecordingSettings
    ? 'Recording Settings'
    : selectedCategory === 'project' ? 'Project Settings' : 'Lyrics';

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="settings-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <button type="button" className="settings-backdrop" aria-label="Close settings" onClick={onClose} />
      <div className="settings-panel" ref={panelRef}>
        <nav className="settings-sidebar" aria-label="Settings categories">
          <button
            type="button"
            className={`settings-category ${isRecordingSettings ? 'selected' : ''}`}
            onClick={() => setSelectedCategory('recording')}>
            Recording Settings
          </button>
          <button
            type="button"
            className={`settings-category ${selectedCategory === 'project' ? 'selected' : ''}`}
            onClick={() => setSelectedCategory('project')}>
            Project Settings
          </button>
          <button
            type="button"
            className={`settings-category ${selectedCategory === 'lyrics' ? 'selected' : ''}`}
            onClick={() => setSelectedCategory('lyrics')}>
            Lyrics
          </button>
        </nav>
        <section className="settings-content" aria-label={title}>
          <div className="settings-content-header">
            <span>{title}</span>
            <button type="button" aria-label="Close settings" onClick={onClose}>
              x
            </button>
          </div>
          {isRecordingSettings ? (
            <div className="recording-settings-grid">
            <label className="recording-setting-control">
              <span>Count</span>
              <select
                aria-label="Recording count-in"
                disabled={controlsDisabled}
                value={recordingLaunch.recordingCountInBeats}
                onChange={event =>
                  recordingLaunch.setRecordingCountInBeats(
                    normalizeRecordingCountInBeats(Number(event.currentTarget.value)),
                  )
                }>
                {RECORDING_COUNT_IN_OPTIONS.map(beats => (
                  <option key={beats} value={beats}>
                    {beats === 0 ? 'Off' : `${beats} beats`}
                  </option>
                ))}
              </select>
            </label>
            <label className="recording-setting-control">
              <span>Pre</span>
              <select
                aria-label="Recording pre-roll"
                disabled={controlsDisabled}
                value={recordingLaunch.recordingPreRollBeats}
                onChange={event =>
                  recordingLaunch.setRecordingPreRollBeats(
                    normalizeRecordingPreRollBeats(Number(event.currentTarget.value)),
                  )
                }>
                {RECORDING_PRE_ROLL_OPTIONS.map(beats => (
                  <option key={beats} value={beats}>
                    {beats === 0 ? 'Off' : `${beats} beats`}
                  </option>
                ))}
              </select>
            </label>
            <label className="recording-setting-control">
              <span>Latency</span>
              <select
                aria-label="Recording latency compensation"
                disabled={controlsDisabled}
                value={recordingLaunch.recordingLatencyCompensationMs}
                onChange={event =>
                  recordingLaunch.setRecordingLatencyCompensationMs(
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
            <label className="recording-setting-toggle">
              <input
                type="checkbox"
                aria-label="Punch recording"
                checked={recordingLaunch.isPunchRecordingEnabled && recordingLaunch.canPunchRecord}
                disabled={punchDisabled}
                onChange={event => recordingLaunch.setPunchRecordingEnabled(event.currentTarget.checked)}
              />
              <span className="recording-setting-toggle-label">
                Punch
                <span className="recording-setting-note">Doesn't work yet</span>
              </span>
            </label>
          </div>
          ) : selectedCategory === 'project' ? (
            <div className="recording-settings-grid project-settings-grid">
              <label className="recording-setting-control">
                <span>Performance Mode</span>
                <select
                  aria-label="Performance mode"
                  value={performanceMode}
                  onChange={event => setPerformanceMode(event.currentTarget.value as ProjectPerformanceMode)}>
                  <option value="linear">Linear arrangement</option>
                  <option value="looper">Looper</option>
                </select>
              </label>
              <label className="recording-setting-control">
                <span>Looper Length</span>
                <select
                  aria-label="Looper length"
                  value={looperLengthBars}
                  onChange={event => setLooperLengthBars(Number(event.currentTarget.value) as LooperLengthBars)}>
                  {LOOPER_LENGTH_OPTIONS.map(bars => (
                    <option key={bars} value={bars}>{bars} bars</option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="recording-settings-grid lyrics-settings-grid">
              <label className="recording-setting-toggle">
                <input
                  type="checkbox"
                  aria-label="Hide coloured sections"
                  checked={areColoredSectionsHidden}
                  onChange={event => onColoredSectionsHiddenChange?.(event.currentTarget.checked)}
                />
                <span className="recording-setting-toggle-label">
                  Hide coloured sections
                </span>
              </label>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
