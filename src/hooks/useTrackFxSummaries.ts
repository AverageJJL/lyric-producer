import {useCallback, useEffect, useState} from 'react';

import {FX_SLOT_PLUGINS} from '../music/fxPluginMetadata';
import type {FxSlotId} from '../native/fxContract';
import {getTrackFxState, summarizeTrackFx} from '../native/fxContract';

export type TrackFxSummaryLabel = {
  trackId: string;
  labels: string[];
};

function formatSummary(trackId: string): TrackFxSummaryLabel {
  try {
    const summary = summarizeTrackFx(getTrackFxState(trackId));
    const labels = summary.enabledSlots.map(
      slot => FX_SLOT_PLUGINS[slot as FxSlotId]?.displayName ?? slot,
    );
    return {trackId, labels};
  } catch {
    return {trackId, labels: []};
  }
}

export function useTrackFxSummaries(trackIds: string[], refreshKey = 0) {
  const [summaries, setSummaries] = useState<TrackFxSummaryLabel[]>([]);

  const refresh = useCallback(() => {
    setSummaries(trackIds.map(formatSummary));
  }, [trackIds]);

  useEffect(() => {
    refresh();
  }, [refresh, refreshKey]);

  useEffect(() => {
    const bridge = window.fxWindow;
    if (!bridge?.onSummaryRefresh) {
      return;
    }
    return bridge.onSummaryRefresh(refresh);
  }, [refresh]);

  return summaries;
}
