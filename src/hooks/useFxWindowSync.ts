import {useEffect, useState} from 'react';

import type {FxWindowSyncPayload} from '../native/fxWindowApi';
import type {DAWTrack} from '../store/useDAWStore';

function toSummary(track: DAWTrack): FxWindowSyncPayload['tracks'][number] {
  return {
    id: track.id,
    name: track.name,
    type: track.type,
    instrumentId: track.instrumentId,
    presetId: track.presetId,
    automationMode: track.automationMode,
  };
}

export function useFxWindowSync(
  tracks: DAWTrack[],
  selectedTrackId: string | null,
  fxTargetTrackId: string | null,
) {
  const [fxRefreshKey, setFxRefreshKey] = useState(0);

  useEffect(() => {
    const bridge = window.fxWindow;
    if (!bridge?.onSummaryRefresh) {
      return;
    }
    return bridge.onSummaryRefresh(() => setFxRefreshKey(key => key + 1));
  }, []);

  useEffect(() => {
    const bridge = window.fxWindow;
    if (!bridge?.syncState) {
      return;
    }
    const payload: FxWindowSyncPayload = {
      targetTrackId: fxTargetTrackId ?? selectedTrackId,
      selectedTrackId,
      tracks: tracks.map(toSummary),
    };
    bridge.syncState(payload);
  }, [tracks, selectedTrackId, fxTargetTrackId]);

  return {fxRefreshKey};
}
