/**
 * Mutable helpers and native write path for per-track FX.
 * set_track_fx requires all three slots on every commit.
 */

import {mergePluginValues} from '../music/fxPluginMetadata';
import {parseNativeCommandError} from './parseNativeResponse';
import {sendNativeAudioCommand} from './NativeAudioEngine';
import {clampPluginValues} from './fxClamps';
import type {
  FxSlotId,
  PluginChainSlot,
  PluginFxParams,
  TrackFxSlot,
  TrackFxState,
} from './fxContract';
import type {FxPluginScanCandidate} from './fxPluginCatalog';
import {
  emptyTrackFxState,
  FX_SLOT_ORDER,
  getTrackFxState,
  normalizePluginChain,
  withNormalizedPluginChain,
} from './fxContract';

export type SetTrackFxResult =
  | {ok: true; state: TrackFxState}
  | {ok: false; error: string; previousState: TrackFxState};

export function getFxSlot(state: TrackFxState, slotId: FxSlotId): TrackFxSlot {
  const found = state.slots.find(slot => slot.slot === slotId);
  if (found) {
    return found;
  }
  return emptyTrackFxState(state.trackId).slots.find(slot => slot.slot === slotId)!;
}

export function getPluginParams(state: TrackFxState, slotId: FxSlotId): PluginFxParams {
  const slot = getFxSlot(state, slotId);
  return {
    pluginId: slot.params.pluginId,
    values: mergePluginValues(slotId, slot.params.values),
  };
}

/** Payload sent to native — values are clamped to the Airwindows 0..1 range. */
export function normalizeTrackFxForSet(state: TrackFxState): TrackFxState {
  const bySlot = new Map(state.slots.map(slot => [slot.slot, slot]));
  const slots: TrackFxSlot[] = FX_SLOT_ORDER.map(slotId => {
    const slot = bySlot.get(slotId) ?? getFxSlot(state, slotId);
    return {
      slot: slotId,
      enabled: slot.enabled,
      params: clampPluginValues(slotId, slot.params),
    };
  });
  return {trackId: state.trackId, slots, pluginChain: normalizePluginChain({...state, slots})};
}

export function updateFxSlot(
  state: TrackFxState,
  slotId: FxSlotId,
  patch: Partial<Pick<TrackFxSlot, 'enabled' | 'params'>>,
): TrackFxState {
  return {
    trackId: state.trackId,
    slots: state.slots.map(slot => {
      if (slot.slot !== slotId) {
        return slot;
      }
      const nextParams = patch.params ?? slot.params;
      return {
        ...slot,
        enabled: patch.enabled ?? slot.enabled,
        params: {
          pluginId: nextParams.pluginId,
          values: mergePluginValues(slotId, nextParams.values),
        },
      };
    }),
  };
}

export function updatePluginParam(
  state: TrackFxState,
  slotId: FxSlotId,
  paramId: string,
  value: number,
): TrackFxState {
  const current = getPluginParams(state, slotId);
  return updateFxSlot(state, slotId, {
    params: {pluginId: current.pluginId, values: {...current.values, [paramId]: value}},
  });
}

export function movePluginChainSlot(
  state: TrackFxState,
  slotId: FxSlotId,
  direction: 'earlier' | 'later',
): TrackFxState {
  const chain = normalizePluginChain(state);
  const index = chain.findIndex(slot => slot.slot === slotId);
  if (index < 0) {
    return state;
  }
  const nextIndex = direction === 'earlier' ? index - 1 : index + 1;
  if (nextIndex < 0 || nextIndex >= chain.length) {
    return {...state, pluginChain: chain};
  }
  const next = chain.map(slot => ({...slot}));
  const moved = next[index]!;
  next[index] = next[nextIndex]!;
  next[nextIndex] = moved;
  return {
    ...state,
    pluginChain: next.map((slot, order) => ({...slot, order})),
  };
}

export function addPluginChainSlot(state: TrackFxState, slotId: FxSlotId): TrackFxState {
  const patchedSlots = updateFxSlot(state, slotId, {enabled: true}).slots;
  const patchedState = {...state, slots: patchedSlots};
  return {
    ...patchedState,
    pluginChain: normalizePluginChain(patchedState).map((slot, order) => ({
      ...slot,
      enabled: slot.slot === slotId ? true : slot.enabled,
      bypassed: slot.slot === slotId ? false : slot.bypassed,
      status: slot.slot === slotId ? 'available' : slot.status,
      order,
    })),
  };
}

export function removePluginChainSlot(state: TrackFxState, slotId: FxSlotId): TrackFxState {
  const patchedSlots = updateFxSlot(state, slotId, {enabled: false}).slots;
  const patchedState = {...state, slots: patchedSlots};
  return {
    ...patchedState,
    pluginChain: normalizePluginChain(patchedState).map((slot, order) => ({
      ...slot,
      enabled: slot.slot === slotId ? false : slot.enabled,
      bypassed: slot.slot === slotId ? true : slot.bypassed,
      order,
    })),
  };
}

export function addExternalPluginChainSlot(
  state: TrackFxState,
  slotId: FxSlotId,
  candidate: FxPluginScanCandidate,
): TrackFxState {
  const patchedSlots = updateFxSlot(state, slotId, {enabled: true}).slots;
  const patchedState = {...state, slots: patchedSlots};
  const chain = normalizePluginChain(patchedState);
  return {
    ...patchedState,
    pluginChain: chain.map((slot, order): PluginChainSlot => ({
      ...slot,
      ...(slot.slot === slotId
        ? {
            pluginId: candidate.pluginId,
            displayName: candidate.displayName,
            format: candidate.format,
            enabled: true,
            bypassed: false,
            status: candidate.status,
            recoveryHint: candidate.recoveryHint,
          }
        : {}),
      order,
    })),
  };
}

export function loadTrackFxState(trackId: string): TrackFxState {
  return getTrackFxState(trackId);
}

export function setTrackFxState(state: TrackFxState): SetTrackFxResult {
  const previousState = state;
  const payload = normalizeTrackFxForSet(state);
  const response = sendNativeAudioCommand('set_track_fx', payload);
  const error = parseNativeCommandError(response);
  if (error) {
    return {ok: false, error, previousState};
  }

  if (!response) {
    return {ok: false, error: 'Native audio engine is not available.', previousState};
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: TrackFxState};
    if (parsed.ok && parsed.data && typeof parsed.data.trackId === 'string') {
      return {ok: true, state: withNormalizedPluginChain(parsed.data)};
    }
  } catch {
    return {ok: false, error: 'Invalid response from audio engine.', previousState};
  }

  return {ok: false, error: 'Audio command failed.', previousState};
}
