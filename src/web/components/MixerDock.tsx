import React from 'react';

import {useTrackFxSummaries} from '../../hooks/useTrackFxSummaries';
import type {DAWTrack} from '../../store/useDAWStore';
import {MasterMixControls} from './MasterMixControls';
import {MixerChannelStrip} from './MixerChannelStrip';

type MixerDockProps = {
  tracks: DAWTrack[];
  masterVolumeDb: number;
  masterPan: number;
  fxRefreshKey: number;
  onClose: () => void;
  onMasterVolumeChange: (volumeDb: number) => void;
  onMasterPanChange: (pan: number) => void;
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onOpenFx: (trackId: string) => void;
};

export function MixerDock({
  tracks,
  masterVolumeDb,
  masterPan,
  fxRefreshKey,
  onClose,
  onMasterVolumeChange,
  onMasterPanChange,
  onTrackVolumeChange,
  onTrackPanChange,
  onToggleMute,
  onToggleSolo,
  onOpenFx,
}: MixerDockProps) {
  const trackIds = React.useMemo(() => tracks.map(track => track.id), [tracks]);
  const fxSummaries = useTrackFxSummaries(trackIds, fxRefreshKey);
  const summaryByTrack = React.useMemo(
    () => new Map(fxSummaries.map(item => [item.trackId, item.labels])),
    [fxSummaries],
  );

  return (
    <>
      <header className="mixer-dock-header">
        <span>Mixer</span>
        <button type="button" className="mixer-dock-close" aria-label="Close mixer" onClick={onClose}>
          ×
        </button>
      </header>
      <div className="mixer-dock-scroll">
        <div className="mixer-strips">
          {tracks.map(track => (
            <MixerChannelStrip
              key={track.id}
              track={track}
              fxLabels={summaryByTrack.get(track.id) ?? []}
              onVolumeChange={onTrackVolumeChange}
              onPanChange={onTrackPanChange}
              onToggleMute={onToggleMute}
              onToggleSolo={onToggleSolo}
              onOpenFx={onOpenFx}
            />
          ))}
        </div>
        <div className="mixer-master">
          <MasterMixControls
            volumeDb={masterVolumeDb}
            pan={masterPan}
            onVolumeChange={onMasterVolumeChange}
            onPanChange={onMasterPanChange}
          />
        </div>
      </div>
    </>
  );
}
