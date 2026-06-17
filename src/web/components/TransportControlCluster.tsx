import React from 'react';

import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import {TransportCycleControl} from './TransportCycleControl';

type TransportControlClusterProps = {
  isPlaying: boolean;
  isRecording: boolean;
  isLeadInPending: boolean;
  canRecord: boolean;
  onReturnToZero: () => void;
  onTogglePlay: () => void;
  onRecordPress: () => void;
};

export function TransportControlCluster({
  isPlaying,
  isRecording,
  isLeadInPending,
  canRecord,
  onReturnToZero,
  onTogglePlay,
  onRecordPress,
}: TransportControlClusterProps) {
  const recordActive = isRecording || isLeadInPending;
  const recordLabel = isRecording
    ? 'Stop recording'
    : isLeadInPending
      ? 'Cancel recording lead-in'
      : canRecord
        ? 'Start recording'
        : 'Record (arm a track first)';

  return (
    <div className="transport-control-cluster" aria-label="Transport controls">
      <button
        className="transport-icon-button return-zero"
        type="button"
        onClick={onReturnToZero}
        aria-label="Return to start">
        <span className="return-zero-glyph" aria-hidden="true">
          <span className="return-zero-bar" />
          <span className="return-zero-triangle" />
        </span>
      </button>
      <button
        className={`transport-icon-button play-toggle ${isPlaying ? 'is-playing' : ''}`}
        type="button"
        data-guide-target={GUIDE_TARGET_IDS['play-button']}
        onClick={onTogglePlay}
        aria-label={isPlaying ? 'Stop' : 'Play'}>
        <span className="play-symbol" aria-hidden="true" />
      </button>
      <button
        className={`transport-icon-button record-toggle ${recordActive ? 'active' : ''}`}
        type="button"
        disabled={!canRecord && !recordActive}
        data-guide-target={GUIDE_TARGET_IDS['record-button']}
        aria-label={recordLabel}
        onClick={onRecordPress}>
        <span className="record-dot" aria-hidden="true" />
      </button>
      <TransportCycleControl variant="compact" />
    </div>
  );
}
