import React, {useEffect, useMemo, useState} from 'react';

import type {AutomationMode} from '../automation/trackAutomation';
import type {FxWindowSyncPayload} from '../native/fxWindowApi';
import type {DAWTrack} from '../store/useDAWStore';
import {InstrumentControlPanel} from './components/InstrumentControlPanel';
import {TrackFxPanel} from './components/fx/TrackFxPanel';

function trackFromSummary(
  summary: FxWindowSyncPayload['tracks'][number] | undefined,
): DAWTrack | null {
  if (!summary) {
    return null;
  }
  return {
    id: summary.id,
    name: summary.name,
    type: summary.type as DAWTrack['type'],
    instrumentId: summary.instrumentId ?? 'four_osc',
    presetId: summary.presetId ?? 'default',
    isMuted: false,
    isSolo: false,
    isRecordArmed: false,
    isLocked: false,
    automationMode: (summary.automationMode as AutomationMode | undefined) ?? 'off',
  };
}

export function FxWindowApp() {
  const [sync, setSync] = useState<FxWindowSyncPayload>({
    targetTrackId: null,
    selectedTrackId: null,
    tracks: [],
  });

  useEffect(() => {
    const bridge = window.fxWindow;
    if (!bridge?.onState) {
      return;
    }
    return bridge.onState(setSync);
  }, []);

  const targetTrackId = sync.targetTrackId ?? sync.selectedTrackId;
  const summary = useMemo(
    () => sync.tracks.find(item => item.id === targetTrackId),
    [sync.tracks, targetTrackId],
  );
  const instrumentTrack = trackFromSummary(summary);

  return (
    <main className="fx-window-app">
      <header className="fx-window-header">
        <h1>{summary?.name ?? 'Track FX'}</h1>
      </header>
      <TrackFxPanel trackId={targetTrackId} trackName={summary?.name} />
      <InstrumentControlPanel track={instrumentTrack} />
    </main>
  );
}
