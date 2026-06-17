import {useCallback, useEffect, useRef, useState} from 'react';

import {FX_SLOT_PLUGINS, mergePluginValues} from '../music/fxPluginMetadata';
import type {FxSlotId, TrackFxState} from '../native/fxContract';
import {getPluginParams, updateFxSlot} from '../native/fxContractOps';

type UseFxSlotDraftArgs = {
  slotId: FxSlotId;
  state: TrackFxState;
  onCommit: (next: TrackFxState) => void;
};

/**
 * Keeps parameter edits responsive by updating local draft values during drag
 * and only calling native set_track_fx when the user releases a control.
 */
export function useFxSlotDraft({slotId, state, onCommit}: UseFxSlotDraftArgs) {
  const pluginId = FX_SLOT_PLUGINS[slotId].pluginId;
  const isEditingRef = useRef(false);
  const draftRef = useRef<Record<string, number>>({});
  const stateRef = useRef(state);
  stateRef.current = state;

  const [draftValues, setDraftValues] = useState<Record<string, number>>(() =>
    getPluginParams(state, slotId).values,
  );

  const syncFromState = useCallback(() => {
    const confirmed = getPluginParams(state, slotId).values;
    draftRef.current = confirmed;
    setDraftValues(confirmed);
  }, [slotId, state]);

  useEffect(() => {
    if (!isEditingRef.current) {
      syncFromState();
    }
  }, [syncFromState]);

  useEffect(() => {
    isEditingRef.current = false;
    syncFromState();
  }, [slotId, syncFromState]);

  const setDraftParam = useCallback((paramId: string, value: number) => {
    isEditingRef.current = true;
    setDraftValues(previous => {
      const next = {...previous, [paramId]: value};
      draftRef.current = next;
      return next;
    });
  }, []);

  const previewDraftValues = useCallback((values: Record<string, number>) => {
    isEditingRef.current = true;
    setDraftValues(previous => {
      const next = mergePluginValues(slotId, {...previous, ...values});
      draftRef.current = next;
      return next;
    });
  }, [slotId]);

  const resetDraft = useCallback(() => {
    isEditingRef.current = false;
    syncFromState();
  }, [syncFromState]);

  const commitDraft = useCallback(() => {
    isEditingRef.current = false;
    const values = mergePluginValues(slotId, draftRef.current);
    draftRef.current = values;
    setDraftValues(values);
    onCommit(
      updateFxSlot(stateRef.current, slotId, {
        params: {pluginId, values},
      }),
    );
  }, [onCommit, pluginId, slotId]);

  return {
    draftValues,
    setDraftParam,
    previewDraftValues,
    resetDraft,
    commitDraft,
  };
}
