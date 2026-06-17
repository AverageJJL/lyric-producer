/**
 * Day-0 FX JSON contract — shared between Agent A (snapshot consumer) and Agent B (C++ impl).
 * Append-only after Day 0; C++ must match these shapes for set_track_fx / get_track_fx.
 */

import {defaultPluginValues, FX_SLOT_PLUGINS} from '../music/fxPluginMetadata';
import {sendNativeAudioCommand} from './NativeAudioEngine';

export type FxSlotId = 'eq' | 'compressor' | 'reverb';
export const FX_SLOT_ORDER: FxSlotId[] = ['eq', 'compressor', 'reverb'];

export type PluginHostFormat = 'builtin_airwindows' | 'external_au' | 'external_vst3';
export type PluginHostStatus = 'available' | 'missing' | 'disabled';

export type PluginFxParams = {
  pluginId: string;
  values: Record<string, number>;
};

export type FxSlotParams = PluginFxParams;

export type TrackFxSlot = {
  slot: FxSlotId;
  enabled: boolean;
  params: FxSlotParams;
};

export type PluginChainSlot = {
  slot: FxSlotId;
  pluginId: string;
  displayName: string;
  format: PluginHostFormat;
  enabled: boolean;
  bypassed: boolean;
  order: number;
  status: PluginHostStatus;
  recoveryHint?: string;
};

/** Full FX chain for one track — up to three slots matching native plugin inserts. */
export type TrackFxState = {
  trackId: string;
  slots: TrackFxSlot[];
  pluginChain?: PluginChainSlot[];
  nativePluginOrder?: FxSlotId[];
  nativePluginBypass?: Partial<Record<FxSlotId, boolean>>;
};

export type SetTrackFxRequest = TrackFxState;

export type GetTrackFxRequest = {
  trackId: string;
};

export type GetTrackFxResponse = TrackFxState;

function slotDefaults(slot: FxSlotId): TrackFxSlot {
  const meta = FX_SLOT_PLUGINS[slot];
  return {
    slot,
    enabled: false,
    params: {pluginId: meta.pluginId, values: defaultPluginValues(slot)},
  };
}

function isFxSlotId(value: unknown): value is FxSlotId {
  return typeof value === 'string' && FX_SLOT_ORDER.includes(value as FxSlotId);
}

function normalizeHostFormat(value: unknown): PluginHostFormat {
  if (value === 'external_au' || value === 'external_vst3') {
    return value;
  }
  return 'builtin_airwindows';
}

function normalizeHostStatus(value: unknown): PluginHostStatus {
  if (value === 'missing' || value === 'disabled') {
    return value;
  }
  return 'available';
}

function externalHostingHint(format: PluginHostFormat): string {
  return format === 'external_au'
    ? 'External AU plugin hosting is disabled in this build.'
    : 'External VST3 plugin hosting is disabled in this build.';
}

function managedSlotRecoveryHint(slot: FxSlotId): string {
  return `Only the built-in ${FX_SLOT_PLUGINS[slot].displayName} processor can be hosted in this slot.`;
}

function withHostRecoveryState(slot: PluginChainSlot): PluginChainSlot {
  if (slot.format === 'external_au' || slot.format === 'external_vst3') {
    return slot.status === 'disabled'
      ? {...slot, recoveryHint: slot.recoveryHint ?? externalHostingHint(slot.format)}
      : slot;
  }

  if (slot.pluginId !== FX_SLOT_PLUGINS[slot.slot].pluginId) {
    return {
      ...slot,
      status: slot.status === 'available' ? 'missing' : slot.status,
      recoveryHint: slot.recoveryHint ?? managedSlotRecoveryHint(slot.slot),
    };
  }
  return slot;
}

function chainSlotFromFxSlot(slot: TrackFxSlot, order: number): PluginChainSlot {
  const meta = FX_SLOT_PLUGINS[slot.slot];
  return {
    slot: slot.slot,
    pluginId: slot.params.pluginId || meta.pluginId,
    displayName: meta.displayName,
    format: 'builtin_airwindows',
    enabled: slot.enabled,
    bypassed: !slot.enabled,
    order,
    status: 'available',
  };
}

function normalizePluginChainSlot(
  state: TrackFxState,
  value: unknown,
  fallbackOrder: number,
): PluginChainSlot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Partial<PluginChainSlot>;
  if (!isFxSlotId(candidate.slot)) {
    return null;
  }
  const slot = state.slots.find(item => item.slot === candidate.slot) ?? slotDefaults(candidate.slot);
  const fallback = chainSlotFromFxSlot(slot, fallbackOrder);
  const order = typeof candidate.order === 'number' && Number.isFinite(candidate.order)
    ? Math.max(0, Math.round(candidate.order))
    : fallback.order;
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : slot.enabled;
  return withHostRecoveryState({
    slot: candidate.slot,
    pluginId: typeof candidate.pluginId === 'string' && candidate.pluginId
      ? candidate.pluginId
      : fallback.pluginId,
    displayName: typeof candidate.displayName === 'string' && candidate.displayName
      ? candidate.displayName
      : fallback.displayName,
    format: normalizeHostFormat(candidate.format),
    enabled,
    bypassed: typeof candidate.bypassed === 'boolean' ? candidate.bypassed : !enabled,
    order,
    status: normalizeHostStatus(candidate.status),
    recoveryHint: typeof candidate.recoveryHint === 'string' && candidate.recoveryHint
      ? candidate.recoveryHint
      : undefined,
  });
}

export function normalizePluginChain(state: TrackFxState): PluginChainSlot[] {
  const bySlot = new Map<FxSlotId, PluginChainSlot>();
  for (const [index, chainSlot] of (state.pluginChain ?? []).entries()) {
    const normalized = normalizePluginChainSlot(state, chainSlot, index);
    if (normalized) {
      bySlot.set(normalized.slot, normalized);
    }
  }

  for (const [index, slotId] of FX_SLOT_ORDER.entries()) {
    if (!bySlot.has(slotId)) {
      const slot = state.slots.find(item => item.slot === slotId) ?? slotDefaults(slotId);
      bySlot.set(slotId, chainSlotFromFxSlot(slot, index));
    }
  }

  return [...bySlot.values()]
    .sort((left, right) => left.order - right.order)
    .map((slot, order) => ({...slot, order}));
}

export function withNormalizedPluginChain(state: TrackFxState): TrackFxState {
  return {...state, pluginChain: normalizePluginChain(state)};
}

/** Default FX chain when native has no stored state for a track. */
export function emptyTrackFxState(trackId: string): TrackFxState {
  const state = {
    trackId,
    slots: FX_SLOT_ORDER.map(slotDefaults),
  };
  return withNormalizedPluginChain(state);
}

/** Test/non-Electron fallback for snapshot FX plugin state summaries. */
export function mockGetTrackFx(trackId: string): TrackFxState {
  return emptyTrackFxState(trackId);
}

function isTrackFxState(value: unknown): value is TrackFxState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const candidate = value as Partial<TrackFxState>;
  return (
    typeof candidate.trackId === 'string' &&
    Array.isArray(candidate.slots) &&
    (
      candidate.nativePluginOrder === undefined ||
      (
        Array.isArray(candidate.nativePluginOrder) &&
        candidate.nativePluginOrder.every(isFxSlotId)
      )
    ) &&
    (
      candidate.nativePluginBypass === undefined ||
      (
        typeof candidate.nativePluginBypass === 'object' &&
        candidate.nativePluginBypass !== null &&
        Object.entries(candidate.nativePluginBypass).every(([slot, bypassed]) =>
          isFxSlotId(slot) && typeof bypassed === 'boolean',
        )
      )
    )
  );
}

export function getTrackFxState(trackId: string): TrackFxState {
  const response = sendNativeAudioCommand('get_track_fx', {trackId});
  if (!response) {
    return emptyTrackFxState(trackId);
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isTrackFxState(parsed.data)) {
      return withNormalizedPluginChain(parsed.data);
    }
  } catch {
    return emptyTrackFxState(trackId);
  }

  return emptyTrackFxState(trackId);
}

/** Compact summary stored in project snapshots (no full parameter maps). */
export type TrackFxSummary = {
  trackId: string;
  enabledSlots: FxSlotId[];
  plugins: Partial<Record<FxSlotId, string>>;
  pluginChain: PluginChainSlot[];
};

export function summarizeTrackFx(state: TrackFxState): TrackFxSummary {
  const plugins: Partial<Record<FxSlotId, string>> = {};
  for (const slot of state.slots) {
    plugins[slot.slot] = slot.params.pluginId;
  }
  return {
    trackId: state.trackId,
    enabledSlots: state.slots.filter(slot => slot.enabled).map(slot => slot.slot),
    plugins,
    pluginChain: normalizePluginChain(state),
  };
}
