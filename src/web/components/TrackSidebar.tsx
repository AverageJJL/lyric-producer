import React, {useEffect, useMemo, useRef, useState} from 'react';

import type {AutomationMode, AutomationTargetType} from '../../automation/trackAutomation';
import type {TrackAutomationCaptureHandler} from '../../hooks/useTrackAutomationCapture';
import type {TrackMoveDirection} from '../../music/trackOrganization';
import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import {registerCopilotRevealHandler} from '../../assistant/copilotRevealRegistry';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import {useDAWStore} from '../../store/useDAWStore';
import {takeSidebarRowsForTrack} from '../../ui/timelineDisplayLanes';
import {RULER_HEIGHT, SIDEBAR_MIN_WIDTH, sidebarMaxWidth} from '../../ui/timelineLayout';
import {AddTrackMenu} from './AddTrackMenu';
import {PushableButton} from './PushableButton';
import {TrackDetailsPopup} from './TrackDetailsPopup';
import {TrackSidebarRow} from './TrackSidebarRow';

type TrackSidebarProps = {
  width: number;
  onWidthChange: (width: number) => void;
  verticalScrollRef: React.RefObject<HTMLDivElement | null>;
  onSidebarWheel: (event: React.WheelEvent<HTMLDivElement>) => void;
  rowHeight: number;
  rulerHeight?: number;
  blocks?: DAWBlock[];
  expandedTakeGroups?: string[];
  isPlaying?: boolean;
  tracks: DAWTrack[];
  archivedTracks: DAWTrack[];
  selectedTrackId: string | null;
  onMoveTrack: (trackId: string, direction: TrackMoveDirection) => void;
  onTrackArchiveChange: (trackId: string, isArchived: boolean) => void;
  onTrackDisableChange: (trackId: string, isDisabled: boolean) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onSelectTrack: (trackId: string) => void;
  onToggleRecordArm: (trackId: string) => void;
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
  onAddVirtualInstrument: (instrumentId: string, presetId: string) => void;
  onAddVoiceAudio: () => void;
  onAddDrumMachine: () => void;
  onImportAudio: () => void;
  onImportMidi: () => void;
  isImportingAudio: boolean;
  isImportingMidi: boolean;
  audioImportError: string | null;
  midiImportError: string | null;
};

export function TrackSidebar({
  width,
  onWidthChange,
  verticalScrollRef,
  onSidebarWheel,
  rowHeight,
  rulerHeight = RULER_HEIGHT,
  blocks = [],
  expandedTakeGroups = [],
  isPlaying = false,
  tracks,
  archivedTracks,
  selectedTrackId,
  onMoveTrack,
  onTrackArchiveChange,
  onTrackDisableChange,
  onToggleMute,
  onToggleSolo,
  onSelectTrack,
  onToggleRecordArm,
  onTrackInputMonitoringChange,
  onTrackAutomationModeChange,
  onTrackAutomationPointSet,
  onTrackAutomationPointRemove,
  onTrackAutomationPointCapture,
  onTrackVolumeChange,
  onTrackPanChange,
  onTrackGainChange,
  onAddVirtualInstrument,
  onAddVoiceAudio,
  onAddDrumMachine,
  onImportAudio,
  onImportMidi,
  isImportingAudio,
  isImportingMidi,
  audioImportError,
  midiImportError,
}: TrackSidebarProps) {
  const dragRef = useRef<{pointerId: number; originX: number; originWidth: number} | null>(null);
  const ignoreOutsideCloseRef = useRef(false);
  const [detailTrackId, setDetailTrackId] = useState<string | null>(null);
  const [detailAnchor, setDetailAnchor] = useState({x: 0, y: 0});
  const maxWidth = useMemo(() => sidebarMaxWidth(window.innerWidth), []);
  const activeTrackId = selectedTrackId ?? tracks[0]?.id ?? null;
  const detailTrack = detailTrackId ? tracks.find(track => track.id === detailTrackId) : null;
  const detailTrackIndex = detailTrack ? tracks.findIndex(track => track.id === detailTrack.id) : -1;
  const detailPlayheadBeat = useDAWStore(state => detailTrackId ? state.playheadBeat : 0);

  useEffect(() => {
    if (detailTrackId && !tracks.some(track => track.id === detailTrackId)) {
      setDetailTrackId(null);
    }
  }, [detailTrackId, tracks]);

  useEffect(() => registerCopilotRevealHandler(targetId => {
    const trackControlMatch = targetId.match(/^track:([^:]+):(details|volume|pan|gain-trim|routing-output|automation-mode)$/);
    if (targetId !== 'track-details' && !trackControlMatch) {
      return false;
    }
    const explicitTrackId = trackControlMatch?.[1];
    const trackId = explicitTrackId ?? activeTrackId;
    if (!trackId || !tracks.some(track => track.id === trackId)) {
      return false;
    }
    const button = document.querySelector(`[data-copilot-id="track:${trackId}:details"]`) as HTMLElement | null;
    const rect = button?.getBoundingClientRect();
    setDetailAnchor({x: rect ? rect.left + rect.width / 2 : width, y: rect ? rect.bottom : rulerHeight});
    onSelectTrack(trackId);
    setDetailTrackId(trackId);
    return true;
  }), [activeTrackId, onSelectTrack, rulerHeight, tracks, width]);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {pointerId: event.pointerId, originX: event.pageX, originWidth: width};
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    onWidthChange(Math.min(maxWidth, Math.max(SIDEBAR_MIN_WIDTH, session.originWidth + event.pageX - session.originX)));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resize(event);
    dragRef.current = null;
  };

  return (
    <aside className="track-sidebar" style={{width}} data-copilot-group="Tracks sidebar">
      <div className="tracks-titlebar">
        <span>Tracks</span>
        <strong>
          {tracks.length} {tracks.length === 1 ? 'lane' : 'lanes'}
          {archivedTracks.length > 0 ? ` · ${archivedTracks.length} archived` : ''}
        </strong>
      </div>
      <div className="track-scroll" ref={verticalScrollRef} onWheel={onSidebarWheel}>
        <div className="ruler-spacer" style={{height: rulerHeight}} />
        {tracks.map(track => (
          <React.Fragment key={track.id}>
            <TrackSidebarRow
              track={track}
              rowHeight={rowHeight}
              isSelected={activeTrackId === track.id}
              detailsOpen={detailTrackId === track.id}
              onToggleMute={onToggleMute}
              onToggleSolo={onToggleSolo}
              onSelectTrack={onSelectTrack}
              onToggleDetails={(trackId, anchor) => {
                ignoreOutsideCloseRef.current = true;
                onSelectTrack(trackId);
                if (detailTrackId === trackId) {
                  setDetailTrackId(null);
                  return;
                }
                setDetailAnchor(anchor);
                setDetailTrackId(trackId);
              }}
              onToggleRecordArm={onToggleRecordArm}
              onTrackInputMonitoringChange={onTrackInputMonitoringChange}
            />
            {takeSidebarRowsForTrack(blocks, track.id, expandedTakeGroups).map(row => (
              <div
                key={row.key}
                className="track-sidebar-take-row"
                aria-label={`Take lane ${row.takeIndex + 1}`}
                style={{height: rowHeight}}
              />
            ))}
          </React.Fragment>
        ))}
        {tracks.length === 0 ? <p className="empty-sidebar">Press + Add track to get started.</p> : null}
        {archivedTracks.length > 0 ? (
          <div className="archived-track-list" aria-label="Archived tracks">
            {archivedTracks.map(track => (
              <div key={track.id} className="archived-track-row">
                <span>{track.name}</span>
                <button type="button" onClick={() => onTrackArchiveChange(track.id, false)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="track-sidebar-actions">
          <AddTrackMenu
            onAddVirtualInstrument={onAddVirtualInstrument}
            onAddVoiceAudio={onAddVoiceAudio}
            onAddDrumMachine={onAddDrumMachine}
          />
          <div className="track-sidebar-imports">
            <PushableButton
              disabled={isImportingAudio}
              guideTargetId={GUIDE_TARGET_IDS['import-audio-button']}
              onClick={onImportAudio}>
              {isImportingAudio ? 'Importing…' : 'Import Audio'}
            </PushableButton>
            <PushableButton
              disabled={isImportingMidi}
              guideTargetId={GUIDE_TARGET_IDS['import-midi-button']}
              onClick={onImportMidi}>
              {isImportingMidi ? 'Importing…' : 'Import MIDI'}
            </PushableButton>
          </div>
          {audioImportError ? <p className="track-sidebar-error">{audioImportError}</p> : null}
          {midiImportError ? <p className="track-sidebar-error">{midiImportError}</p> : null}
        </div>
      </div>
      {detailTrack && detailTrackIndex >= 0 ? (
        <TrackDetailsPopup
          track={detailTrack}
          tracks={tracks}
          index={detailTrackIndex}
          playheadBeat={detailPlayheadBeat}
          isPlaying={isPlaying}
          anchor={detailAnchor}
          ignoreOutsideCloseRef={ignoreOutsideCloseRef}
          onClose={() => setDetailTrackId(null)}
          onMoveTrack={onMoveTrack}
          onTrackArchiveChange={onTrackArchiveChange}
          onTrackDisableChange={onTrackDisableChange}
          onTrackInputMonitoringChange={onTrackInputMonitoringChange}
          onTrackAutomationModeChange={onTrackAutomationModeChange}
          onTrackAutomationPointSet={onTrackAutomationPointSet}
          onTrackAutomationPointRemove={onTrackAutomationPointRemove}
          onTrackAutomationPointCapture={onTrackAutomationPointCapture}
          onTrackVolumeChange={onTrackVolumeChange}
          onTrackPanChange={onTrackPanChange}
          onTrackGainChange={onTrackGainChange}
        />
      ) : null}
      <div
        className="sidebar-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
    </aside>
  );
}
