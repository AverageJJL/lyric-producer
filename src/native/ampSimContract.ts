import {parseNativeCommandError} from './parseNativeResponse';
import {sendNativeAudioCommand} from './NativeAudioEngine';

export type AmpSimInputMode = 'guitar_di' | 'bass_di';
export type AmpSimPedalType = 'noise_gate' | 'compressor' | 'overdrive' | 'eq' | 'boost';
export type AmpSimCabinetIrId =
  | 'guitar_us_2x12'
  | 'guitar_uk_4x12'
  | 'bass_modern_8x10'
  | 'bass_vintage_1x15';

export type AmpSimPedal = {
  id: string;
  type: AmpSimPedalType;
  enabled: boolean;
  params: Record<string, number>;
};

export type AmpSimCabinet = {
  enabled: boolean;
  irId: AmpSimCabinetIrId;
  mix: number;
};

export type TrackAmpSimState = {
  trackId: string;
  enabled: boolean;
  inputMode: AmpSimInputMode;
  monitoring: boolean;
  lowLatencyMonitoring?: boolean;
  pedals: AmpSimPedal[];
  cabinet: AmpSimCabinet;
};

export type SetTrackAmpSimResult =
  | {ok: true; state: TrackAmpSimState}
  | {ok: false; error: string; previousState: TrackAmpSimState};

const PEDAL_TYPES = new Set<AmpSimPedalType>([
  'noise_gate',
  'compressor',
  'overdrive',
  'eq',
  'boost',
]);

const CABINET_IDS = new Set<AmpSimCabinetIrId>([
  'guitar_us_2x12',
  'guitar_uk_4x12',
  'bass_modern_8x10',
  'bass_vintage_1x15',
]);

function clamp01(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function defaultCabinet(inputMode: AmpSimInputMode): AmpSimCabinet {
  return {
    enabled: true,
    irId: inputMode === 'bass_di' ? 'bass_modern_8x10' : 'guitar_us_2x12',
    mix: 1,
  };
}

export function emptyTrackAmpSimState(
  trackId: string,
  inputMode: AmpSimInputMode = 'guitar_di',
): TrackAmpSimState {
  return {
    trackId,
    enabled: false,
    inputMode,
    monitoring: false,
    lowLatencyMonitoring: false,
    pedals: [
      {id: 'gate', type: 'noise_gate', enabled: true, params: {threshold: 0.18, floor: 0.06}},
      {id: 'drive', type: 'overdrive', enabled: true, params: {drive: 0.35, tone: 0.55, level: 0.72, mix: 1}},
      {id: 'shape', type: 'eq', enabled: true, params: {low: 0.48, mid: 0.58, high: 0.54, level: 0.7}},
    ],
    cabinet: defaultCabinet(inputMode),
  };
}

function normalizeParams(params: Record<string, unknown> | undefined): Record<string, number> {
  const normalized: Record<string, number> = {};
  Object.entries(params ?? {}).forEach(([key, value]) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      normalized[key] = clamp01(value);
    }
  });
  return normalized;
}

function normalizePedal(pedal: Partial<AmpSimPedal>, index: number): AmpSimPedal {
  const type = PEDAL_TYPES.has(pedal.type as AmpSimPedalType)
    ? pedal.type as AmpSimPedalType
    : 'boost';
  return {
    id: pedal.id && pedal.id.trim().length > 0 ? pedal.id : `pedal-${index + 1}`,
    type,
    enabled: pedal.enabled !== false,
    params: normalizeParams(pedal.params),
  };
}

export function normalizeTrackAmpSimForSet(state: TrackAmpSimState): TrackAmpSimState {
  const inputMode: AmpSimInputMode = state.inputMode === 'bass_di' ? 'bass_di' : 'guitar_di';
  const fallbackCabinet = defaultCabinet(inputMode);
  const cabinetId = CABINET_IDS.has(state.cabinet.irId)
    ? state.cabinet.irId
    : fallbackCabinet.irId;
  return {
    trackId: state.trackId,
    enabled: state.enabled === true,
    inputMode,
    monitoring: state.monitoring === true,
    lowLatencyMonitoring: state.lowLatencyMonitoring === true,
    pedals: state.pedals.slice(0, 8).map(normalizePedal),
    cabinet: {
      enabled: state.cabinet.enabled !== false,
      irId: cabinetId,
      mix: clamp01(state.cabinet.mix, fallbackCabinet.mix),
    },
  };
}

function isAmpSimState(value: unknown): value is TrackAmpSimState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<TrackAmpSimState>;
  return (
    typeof state.trackId === 'string' &&
    typeof state.enabled === 'boolean' &&
    (state.inputMode === 'guitar_di' || state.inputMode === 'bass_di') &&
    typeof state.monitoring === 'boolean' &&
    Array.isArray(state.pedals) &&
    Boolean(state.cabinet)
  );
}

export function getTrackAmpSimState(trackId: string): TrackAmpSimState {
  const response = sendNativeAudioCommand('get_amp_sim', {trackId});
  if (!response) {
    return emptyTrackAmpSimState(trackId);
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isAmpSimState(parsed.data)) {
      return normalizeTrackAmpSimForSet(parsed.data);
    }
  } catch {
    return emptyTrackAmpSimState(trackId);
  }

  return emptyTrackAmpSimState(trackId);
}

export function setTrackAmpSimState(state: TrackAmpSimState): SetTrackAmpSimResult {
  const previousState = state;
  const payload = normalizeTrackAmpSimForSet(state);
  const response = sendNativeAudioCommand('set_amp_sim', payload);
  const error = parseNativeCommandError(response);
  if (error) {
    return {ok: false, error, previousState};
  }

  try {
    const parsed = JSON.parse(response!) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isAmpSimState(parsed.data)) {
      return {ok: true, state: normalizeTrackAmpSimForSet(parsed.data)};
    }
  } catch {
    return {ok: false, error: 'Invalid response from audio engine.', previousState};
  }

  return {ok: false, error: 'Audio command failed.', previousState};
}
