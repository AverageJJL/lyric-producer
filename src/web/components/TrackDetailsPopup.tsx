import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import type {AutomationMode, AutomationTargetType} from '../../automation/trackAutomation';
import type {TrackAutomationCaptureHandler} from '../../hooks/useTrackAutomationCapture';
import type {TrackMoveDirection} from '../../music/trackOrganization';
import type {DAWTrack} from '../../store/useDAWStore';
import {anchoredPopupPosition} from '../../ui/anchoredPopupPosition';
import {TrackFreezeButton} from './TrackFreezeButton';
import {TrackHeightControl} from './TrackHeightControl';
import {TrackMixControls} from './TrackMixControls';
import {TrackOrganizationLabels} from './TrackOrganizationLabels';
import {TrackRoutingControls} from './TrackRoutingControls';

type TrackDetailsPopupProps = {
  track: DAWTrack;
  tracks: DAWTrack[];
  index: number;
  playheadBeat: number;
  isPlaying: boolean;
  anchor: {x: number; y: number};
  rightOverlayInset?: number;
  ignoreOutsideCloseRef: React.RefObject<boolean>;
  onClose: () => void;
  onMoveTrack: (trackId: string, direction: TrackMoveDirection) => void;
  onTrackArchiveChange: (trackId: string, isArchived: boolean) => void;
  onTrackDisableChange: (trackId: string, isDisabled: boolean) => void;
  onTrackInputMonitoringChange: (trackId: string, enabled: boolean) => void;
  onTrackAutomationModeChange: (trackId: string, mode: AutomationMode) => void;
  onTrackAutomationPointSet: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
    value: number,
  ) => void;
  onTrackAutomationPointRemove: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
  ) => void;
  onTrackAutomationPointCapture?: TrackAutomationCaptureHandler;
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onTrackGainChange: (trackId: string, gainDb: number) => void;
};

const PANEL_WIDTH = 340;
const PANEL_MAX_HEIGHT = 480;

function trackTypeLabel(type: DAWTrack['type']): string {
  if (type === 'voice_audio') {
    return 'Audio';
  }
  if (type === 'drum_machine') {
    return 'Drums';
  }
  return 'Instrument';
}

export function TrackDetailsPopup({
  track,
  tracks,
  index,
  playheadBeat,
  isPlaying,
  anchor,
  rightOverlayInset = 0,
  ignoreOutsideCloseRef,
  onClose,
  onMoveTrack,
  onTrackArchiveChange,
  onTrackDisableChange,
  onTrackInputMonitoringChange,
  onTrackAutomationModeChange,
  onTrackAutomationPointSet,
  onTrackAutomationPointRemove,
  onTrackAutomationPointCapture,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackGainChange,
}: TrackDetailsPopupProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({left: 0, top: 0});

  useLayoutEffect(() => {
    if (!panelRef.current) {
      return;
    }
    const rect = panelRef.current.getBoundingClientRect();
    setPosition(anchoredPopupPosition(
      anchor.x,
      anchor.y,
      rect.width || PANEL_WIDTH,
      rect.height || PANEL_MAX_HEIGHT,
      {rightInset: rightOverlayInset},
    ));
  }, [anchor.x, anchor.y, rightOverlayInset, track.id]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (ignoreOutsideCloseRef.current) {
        ignoreOutsideCloseRef.current = false;
        return;
      }
      const target = event.target as Node;
      if (panelRef.current?.contains(target)) {
        return;
      }
      onClose();
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [ignoreOutsideCloseRef, onClose]);

  const panel = (
    <div
      ref={panelRef}
      className="track-menu-panel track-menu-panel-floating track-details-popup"
      style={{left: position.left, top: position.top, width: PANEL_WIDTH}}
      role="dialog"
      aria-label={`Track details for ${track.name}`}
      data-copilot-id={`track:${track.id}:details-popup`}
      data-copilot-group={`Track details for ${track.name}`}>
      <div className="track-details-popup-header">
        <strong>{track.name}</strong>
        <span>{trackTypeLabel(track.type)}</span>
      </div>
      <div className="track-details-popup-scroll">
        <div className="track-row-detail-actions">
          <button
            type="button"
            className="mini-button track-org-button"
            disabled={index === 0}
            aria-label={`Move ${track.name} up`}
            data-copilot-id={`track:${track.id}:move-up`}
            data-copilot-purpose="Move this track one lane earlier."
            onClick={() => onMoveTrack(track.id, -1)}>
            Up
          </button>
          <button
            type="button"
            className="mini-button track-org-button"
            disabled={index === tracks.length - 1}
            aria-label={`Move ${track.name} down`}
            data-copilot-id={`track:${track.id}:move-down`}
            data-copilot-purpose="Move this track one lane later."
            onClick={() => onMoveTrack(track.id, 1)}>
            Down
          </button>
          <button
            type="button"
            className="mini-button track-org-button"
            aria-label={`${track.isDisabled ? 'Enable' : 'Disable'} ${track.name}`}
            data-copilot-id={`track:${track.id}:disable`}
            data-copilot-label={`${track.isDisabled ? 'Enable' : 'Disable'} ${track.name}`}
            data-copilot-purpose="Exclude or restore this track from native playback without deleting it."
            onClick={() => onTrackDisableChange(track.id, track.isDisabled !== true)}>
            {track.isDisabled ? 'On' : 'Off'}
          </button>
          <TrackFreezeButton track={track} />
          <TrackOrganizationLabels track={track} />
          <TrackHeightControl track={track} />
          <button
            type="button"
            className="mini-button track-org-button"
            aria-label={`Archive ${track.name}`}
            data-copilot-id={`track:${track.id}:archive`}
            data-copilot-purpose="Hide this track from the active timeline while keeping it in the project."
            onClick={() => onTrackArchiveChange(track.id, true)}>
            Hide
          </button>
        </div>
        <TrackMixControls
          track={track}
          playheadBeat={playheadBeat}
          isPlaying={isPlaying}
          onInputMonitoringChange={onTrackInputMonitoringChange}
          onAutomationModeChange={onTrackAutomationModeChange}
          onAutomationPointSet={onTrackAutomationPointSet}
          onAutomationPointRemove={onTrackAutomationPointRemove}
          onAutomationPointCapture={onTrackAutomationPointCapture}
          onVolumeChange={onTrackVolumeChange}
          onPanChange={onTrackPanChange}
          onGainChange={onTrackGainChange}
        />
        <TrackRoutingControls track={track} tracks={tracks} />
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
