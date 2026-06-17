import React from 'react';

import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import {normalizeTrackMix} from '../../music/trackMix';
import type {DAWTrack} from '../../store/useDAWStore';
import {getTrackInstrumentLabel} from '../../store/useDAWStore';
import {timelineTrackHeight} from '../../ui/timelineTrackLanes';

type TrackSidebarRowProps = {
  track: DAWTrack;
  rowHeight: number;
  isSelected: boolean;
  detailsOpen: boolean;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleDetails: (trackId: string, anchor: {x: number; y: number}) => void;
  onToggleRecordArm: (trackId: string) => void;
  onTrackInputMonitoringChange: (trackId: string, enabled: boolean) => void;
};

function trackTypeLabel(type: DAWTrack['type']): string {
  if (type === 'voice_audio') {
    return 'AUDIO';
  }
  if (type === 'drum_machine') {
    return 'DRUM';
  }
  return 'INST';
}

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

export function TrackSidebarRow({
  track,
  rowHeight,
  isSelected,
  detailsOpen,
  onToggleMute,
  onToggleSolo,
  onSelectTrack,
  onToggleDetails,
  onToggleRecordArm,
  onTrackInputMonitoringChange,
}: TrackSidebarRowProps) {
  const mix = normalizeTrackMix(track);
  const frozen = track.isFrozen === true;
  const className = [
    'track-row',
    'compact',
    isSelected ? 'selected' : '',
    track.isDisabled ? 'disabled' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={className}
      style={{height: timelineTrackHeight(track, rowHeight)}}
      data-copilot-group={`Track row ${track.name}`}>
      <div
        className="track-row-header"
        role="button"
        tabIndex={0}
        aria-pressed={isSelected}
        onClick={() => onSelectTrack(track.id)}
        onKeyDown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelectTrack(track.id);
          }
        }}>
        <div className="track-main">
          <span className="track-type">{trackTypeLabel(track.type)}</span>
          <span className="track-name">{track.name}</span>
          <span className="track-sound">{getTrackInstrumentLabel(track)}</span>
          <span className="track-summary">
            Vol {dbLabel(mix.volumeDb)} / Pan {panLabel(mix.pan)}
          </span>
        </div>
        <span
          className="track-controls track-core-controls"
          onClick={stopRowSelection}
          onPointerDown={stopRowSelection}>
          <button
            type="button"
            className={`mini-button record ${track.isRecordArmed ? 'active' : ''}`}
            title={`Record arm ${track.name}`}
            data-copilot-id={`track:${track.id}:record-arm`}
            data-copilot-purpose="Arm this track for recording."
            data-guide-target={GUIDE_TARGET_IDS['track-record-arm']}
            disabled={frozen}
            onClick={event => {
              event.stopPropagation();
              onToggleRecordArm(track.id);
            }}>
            R
          </button>
          <button
            type="button"
            className={`mini-button ${track.isMuted ? 'active' : ''}`}
            aria-pressed={track.isMuted}
            title={`Mute ${track.name}`}
            data-copilot-id={`track:${track.id}:mute`}
            data-copilot-purpose="Mute this track during playback."
            data-guide-target={GUIDE_TARGET_IDS['track-mute']}
            onClick={event => {
              event.stopPropagation();
              onToggleMute(track.id);
            }}>
            M
          </button>
          <button
            type="button"
            className={`mini-button ${track.isSolo ? 'active' : ''}`}
            title={`Solo ${track.name}`}
            data-copilot-id={`track:${track.id}:solo`}
            data-copilot-purpose="Solo this track during playback."
            data-guide-target={GUIDE_TARGET_IDS['track-solo']}
            onClick={event => {
              event.stopPropagation();
              onToggleSolo(track.id);
            }}>
            S
          </button>
          {track.type === 'voice_audio' ? (
            <button
              type="button"
              className={`mini-button ${track.isInputMonitoringEnabled ? 'active' : ''}`}
              title={`Input monitor ${track.name}`}
              data-copilot-id={`track:${track.id}:input-monitor`}
              data-copilot-purpose="Monitor this audio input through the native engine."
              disabled={frozen}
              onClick={event => {
                event.stopPropagation();
                onTrackInputMonitoringChange(track.id, track.isInputMonitoringEnabled !== true);
              }}>
              I
            </button>
          ) : null}
          <button
            type="button"
            className={`mini-button track-detail-button ${detailsOpen ? 'active' : ''}`}
            aria-label={`${detailsOpen ? 'Hide' : 'Show'} track details for ${track.name}`}
            aria-expanded={detailsOpen}
            data-copilot-id={`track:${track.id}:details`}
            data-copilot-purpose="Open detailed mix, routing, automation, and organization controls for this track."
            data-guide-target={GUIDE_TARGET_IDS['track-details']}
            onClick={event => {
              event.stopPropagation();
              onToggleDetails(track.id, {x: event.clientX, y: event.clientY});
            }}>
            ...
          </button>
        </span>
      </div>
    </div>
  );
}
