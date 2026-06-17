import {FX_SLOT_PLUGINS} from '../music/fxPluginMetadata';
import type {FxSlotId, TrackFxState} from '../native/fxContract';
import {getPluginParams, updateFxSlot} from '../native/fxContractOps';
import type {ArrangementValidationError} from './schemaValidation';

export type AiFxControllableSlot = Extract<FxSlotId, 'eq' | 'compressor'>;

export type AiFxTarget = {
  trackId: string;
  slot: AiFxControllableSlot;
  pluginId: string;
  enabled?: boolean;
  values: Record<string, number>;
  reasoning?: string;
};

export type AiFxStrippedSuggestion = {
  path: string;
  field: string;
  reason: 'mono_downmix_safety';
};

export type AiFxParseResult =
  | {ok: true; targets: AiFxTarget[]; stripped: AiFxStrippedSuggestion[]}
  | {ok: false; errors: ArrangementValidationError[]; stripped: AiFxStrippedSuggestion[]};

const CONTROLLABLE_SLOTS = new Set<AiFxControllableSlot>(['eq', 'compressor']);
const MONO_UNSAFE_PATTERNS = ['pan', 'width', 'stereo', 'spatial', 'image', 'balance'];

function error(
  errors: ArrangementValidationError[],
  path: string,
  message: string,
): null {
  errors.push({path, message});
  return null;
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function monoUnsafe(value: string): boolean {
  const lower = value.toLowerCase();
  return MONO_UNSAFE_PATTERNS.some(pattern => lower.includes(pattern));
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function targetArray(payload: unknown, errors: ArrangementValidationError[]): unknown[] | null {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!record(payload)) {
    return error(errors, '$', 'Expected an AI FX target object or array.');
  }
  const raw = payload.fx ?? payload.targets;
  return Array.isArray(raw)
    ? raw
    : error(errors, 'fx', 'Expected an fx or targets array.');
}

function stringField(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: ArrangementValidationError[],
): string | null {
  return typeof value[key] === 'string' && value[key].trim().length > 0
    ? value[key].trim()
    : error(errors, `${path}.${key}`, 'Expected a non-empty string.');
}

function parseValues(
  values: unknown,
  slot: AiFxControllableSlot,
  path: string,
  errors: ArrangementValidationError[],
  stripped: AiFxStrippedSuggestion[],
): Record<string, number> | null {
  if (!record(values)) {
    return error(errors, path, 'Expected FX parameter values object.');
  }
  const allowed = new Set(FX_SLOT_PLUGINS[slot].params.map(param => param.id));
  const parsed: Record<string, number> = {};
  Object.entries(values).forEach(([field, raw]) => {
    if (monoUnsafe(field)) {
      stripped.push({path: `${path}.${field}`, field, reason: 'mono_downmix_safety'});
      return;
    }
    if (!allowed.has(field)) {
      error(errors, `${path}.${field}`, `Unsupported ${slot} parameter "${field}".`);
      return;
    }
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      error(errors, `${path}.${field}`, 'Expected a finite normalized value.');
      return;
    }
    parsed[field] = clamp01(raw);
  });
  return Object.keys(parsed).length > 0 ? parsed : null;
}

function parseTarget(
  value: unknown,
  index: number,
  errors: ArrangementValidationError[],
  stripped: AiFxStrippedSuggestion[],
): AiFxTarget | null {
  const path = `fx[${index}]`;
  if (!record(value)) {
    return error(errors, path, 'Expected an AI FX target object.');
  }

  const trackId = stringField(value, 'trackId', path, errors);
  const rawSlot = stringField(value, 'slot', path, errors);
  if (!trackId || !rawSlot) {
    return null;
  }
  if (monoUnsafe(rawSlot)) {
    stripped.push({path: `${path}.slot`, field: rawSlot, reason: 'mono_downmix_safety'});
    return null;
  }
  if (!CONTROLLABLE_SLOTS.has(rawSlot as AiFxControllableSlot)) {
    return error(errors, `${path}.slot`, 'Expected slot eq or compressor.');
  }

  const slot = rawSlot as AiFxControllableSlot;
  const rawValues = value.values ?? value.params;
  const values = parseValues(rawValues, slot, `${path}.values`, errors, stripped);
  const enabled = value.enabled;
  if (enabled !== undefined && typeof enabled !== 'boolean') {
    error(errors, `${path}.enabled`, 'Expected a boolean when provided.');
  }
  if (!values || (enabled !== undefined && typeof enabled !== 'boolean')) {
    return null;
  }

  const target: AiFxTarget = {
    trackId,
    slot,
    pluginId: FX_SLOT_PLUGINS[slot].pluginId,
    values,
  };
  if (typeof enabled === 'boolean') {
    target.enabled = enabled;
  }
  if (typeof value.reasoning === 'string') {
    target.reasoning = value.reasoning;
  }
  return target;
}

export function validateAiFxPayload(payload: unknown): AiFxParseResult {
  const errors: ArrangementValidationError[] = [];
  const stripped: AiFxStrippedSuggestion[] = [];
  const rawTargets = targetArray(payload, errors);
  const targets = rawTargets
    ? rawTargets
        .map((item, index) => parseTarget(item, index, errors, stripped))
        .filter((target): target is AiFxTarget => target !== null)
    : [];
  return errors.length === 0
    ? {ok: true, targets, stripped}
    : {ok: false, errors, stripped};
}

export function parseAiFxJson(json: string): AiFxParseResult {
  try {
    return validateAiFxPayload(JSON.parse(json));
  } catch {
    return {ok: false, errors: [{path: '$', message: 'Invalid JSON.'}], stripped: []};
  }
}

export function applyAiFxTargetToState(
  state: TrackFxState,
  target: AiFxTarget,
): TrackFxState {
  if (state.trackId !== target.trackId) {
    return state;
  }
  const current = getPluginParams(state, target.slot);
  return updateFxSlot(state, target.slot, {
    enabled: target.enabled ?? true,
    params: {
      pluginId: current.pluginId,
      values: {...current.values, ...target.values},
    },
  });
}
