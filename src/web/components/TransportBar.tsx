import React from 'react';

import type {TimeSignature} from '../../store/projectMetadata';
import {TransportControlCluster} from './TransportControlCluster';
import {TransportMetronomeButton} from './TransportMetronomeButton';
import {TransportTempoLcd} from './TransportTempoLcd';

type TransportBarProps = {
  projectFileControls?: React.ReactNode;
  workspaceNav?: React.ReactNode;
  isPlaying: boolean;
  isRecording: boolean;
  isLeadInPending: boolean;
  canRecord: boolean;
  bpm: number;
  timeSignature: TimeSignature;
  minBpm: number;
  maxBpm: number;
  isMetronomeEnabled: boolean;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (timeSignature: TimeSignature) => void;
  onToggleMetronome: () => void;
  onTogglePlay: () => void;
  onReturnToZero: () => void;
  onRecordPress: () => void;
};

export function TransportBar({
  projectFileControls,
  workspaceNav,
  isPlaying,
  isRecording,
  isLeadInPending,
  canRecord,
  bpm,
  timeSignature,
  minBpm,
  maxBpm,
  isMetronomeEnabled,
  onBpmChange,
  onTimeSignatureChange,
  onToggleMetronome,
  onTogglePlay,
  onReturnToZero,
  onRecordPress,
}: TransportBarProps) {
  return (
    <header className="transport-bar transport-bar-refreshed">
      <div className="transport-bar-leading">{projectFileControls}</div>
      <div className="transport-bar-center">
        <TransportControlCluster
          isPlaying={isPlaying}
          isRecording={isRecording}
          isLeadInPending={isLeadInPending}
          canRecord={canRecord}
          onReturnToZero={onReturnToZero}
          onTogglePlay={onTogglePlay}
          onRecordPress={onRecordPress}
        />
        <TransportTempoLcd
          bpm={bpm}
          timeSignature={timeSignature}
          minBpm={minBpm}
          maxBpm={maxBpm}
          onBpmChange={onBpmChange}
          onTimeSignatureChange={onTimeSignatureChange}
        />
        <div className="transport-post-lcd-controls" aria-label="Transport toggles">
          <TransportMetronomeButton isEnabled={isMetronomeEnabled} onToggle={onToggleMetronome} />
        </div>
      </div>
      <div className="transport-bar-trailing">{workspaceNav}</div>
    </header>
  );
}
