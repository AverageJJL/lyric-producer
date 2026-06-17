import {useCallback, useEffect, useRef, useState} from 'react';

import type {FxSlotId, TrackFxState} from '../native/fxContract';
import {emptyTrackFxState} from '../native/fxContract';
import {
  loadTrackFxState,
  setTrackFxState,
  updateFxSlot,
} from '../native/fxContractOps';

type UseTrackFxStateResult = {
  state: TrackFxState | null;
  isLoading: boolean;
  error: string | null;
  activeSlot: FxSlotId;
  setActiveSlot: (slot: FxSlotId) => void;
  refresh: () => void;
  commit: (next: TrackFxState) => void;
  toggleSlot: (slotId: FxSlotId, enabled: boolean) => void;
};

export function useTrackFxState(trackId: string | null): UseTrackFxStateResult {
  const [state, setState] = useState<TrackFxState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<FxSlotId>('eq');
  const confirmedRef = useRef<TrackFxState | null>(null);

  const refresh = useCallback(() => {
    if (!trackId) {
      setState(null);
      confirmedRef.current = null;
      return;
    }
    setIsLoading(true);
    setError(null);
    const loaded = loadTrackFxState(trackId);
    setState(loaded);
    confirmedRef.current = loaded;
    setIsLoading(false);
  }, [trackId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const commit = useCallback((next: TrackFxState) => {
    // Optimistic UI: keep draft controls in sync while native round-trip completes.
    const previous = confirmedRef.current ?? emptyTrackFxState(next.trackId);
    setState(next);
    const result = setTrackFxState(next);
    if (result.ok) {
      setState(result.state);
      confirmedRef.current = result.state;
      setError(null);
      window.fxWindow?.notifyChanged?.();
      return;
    }
    setState(previous);
    confirmedRef.current = previous;
    setError(result.error);
  }, []);

  const toggleSlot = useCallback(
    (slotId: FxSlotId, enabled: boolean) => {
      if (!state) {
        return;
      }
      commit(updateFxSlot(state, slotId, {enabled}));
    },
    [commit, state],
  );

  return {
    state,
    isLoading,
    error,
    activeSlot,
    setActiveSlot,
    refresh,
    commit,
    toggleSlot,
  };
}
