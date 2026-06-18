import {
  COPILOT_DRUM_EDIT_KEYS,
  COPILOT_DRUM_LANE_KEYS,
  COPILOT_DRUM_OPTION_KEYS,
  COPILOT_DRUM_SAMPLE_KEYS,
  hasOnlyKnownKeys,
} from './copilotContract';

export {
  drumLanesSchema,
  drumPatternEditSchema,
  drumPatternOptionSchema,
} from './copilotContract';

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function validDrumLanes(value: unknown): boolean {
  if (!record(value) || !hasOnlyKnownKeys(value, COPILOT_DRUM_LANE_KEYS)) {
    return false;
  }
  return COPILOT_DRUM_SAMPLE_KEYS.every(key =>
    Array.isArray(value[key]) &&
    value[key].every(step =>
      typeof step === 'number' && Number.isInteger(step) && step >= 0 && step <= 15,
    ),
  );
}

export function validDrumPatternOption(value: Record<string, unknown>): boolean {
  return hasOnlyKnownKeys(value, COPILOT_DRUM_OPTION_KEYS) &&
    typeof value.id === 'string' &&
    typeof value.label === 'string' &&
    typeof value.description === 'string' &&
    typeof value.startBeat === 'number' && Number.isFinite(value.startBeat) && value.startBeat >= 0 &&
    typeof value.lengthBeats === 'number' && Number.isFinite(value.lengthBeats) && value.lengthBeats > 0 &&
    typeof value.kitId === 'string' &&
    validDrumLanes(value.lanes);
}

export function validDrumPatternEdit(value: Record<string, unknown>): boolean {
  return hasOnlyKnownKeys(value, COPILOT_DRUM_EDIT_KEYS) &&
    value.op === 'replaceDrumPattern' &&
    typeof value.blockId === 'string' &&
    (value.name === undefined || typeof value.name === 'string') &&
    validDrumLanes(value.lanes);
}
