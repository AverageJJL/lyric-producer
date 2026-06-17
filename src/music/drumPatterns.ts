import type {DrumSampleKey} from '../assets/drumKit';
import {DRUM_SAMPLE_KEYS} from '../assets/drumKit';

/** Sixteenth notes in one 4/4 bar. */
export const STEPS_PER_BAR = 16;

/** One sixteenth note in beats (4 beats / 16 steps). */
export const BEATS_PER_STEP = 0.25;

export const BEATS_PER_BAR = STEPS_PER_BAR * BEATS_PER_STEP;

export type DrumPattern = {
  id: string;
  name: string;
  steps: Record<DrumSampleKey, boolean[]>;
};

let patternCounter = 0;

function nextPatternId(): string {
  patternCounter += 1;
  return `pattern-${Date.now()}-${patternCounter}`;
}

function emptyStepRow(): boolean[] {
  return Array.from({length: STEPS_PER_BAR}, () => false);
}

/**
 * Ensures every drum lane exists (e.g. patterns saved before the 8-lane kit).
 * Existing step rows are preserved; missing lanes get cleared 16-step rows.
 */
export function normalizeDrumPattern(pattern: DrumPattern): DrumPattern {
  const steps = {} as Record<DrumSampleKey, boolean[]>;
  DRUM_SAMPLE_KEYS.forEach(key => {
    const existing = pattern.steps[key];
    if (existing && existing.length === STEPS_PER_BAR) {
      steps[key] = [...existing];
    } else {
      steps[key] = emptyStepRow();
    }
  });
  return {...pattern, steps};
}

/** New empty 1-bar pattern with all lanes cleared. */
export function createEmptyPattern(name: string, id?: string): DrumPattern {
  const steps = {} as Record<DrumSampleKey, boolean[]>;
  DRUM_SAMPLE_KEYS.forEach(key => {
    steps[key] = emptyStepRow();
  });
  return {
    id: id ?? nextPatternId(),
    name,
    steps,
  };
}

export function toggleStep(
  pattern: DrumPattern,
  sampleKey: DrumSampleKey,
  step: number,
): DrumPattern {
  const normalized = normalizeDrumPattern(pattern);
  const clamped = Math.max(0, Math.min(step, STEPS_PER_BAR - 1));
  const row = [...normalized.steps[sampleKey]];
  row[clamped] = !row[clamped];
  return {
    ...normalized,
    steps: {...normalized.steps, [sampleKey]: row},
  };
}

export function setStep(
  pattern: DrumPattern,
  sampleKey: DrumSampleKey,
  step: number,
  active: boolean,
): DrumPattern {
  const normalized = normalizeDrumPattern(pattern);
  const clamped = Math.max(0, Math.min(step, STEPS_PER_BAR - 1));
  const row = [...normalized.steps[sampleKey]];
  row[clamped] = active;
  return {
    ...normalized,
    steps: {...normalized.steps, [sampleKey]: row},
  };
}

/** Step indices where the lane is active (for engine preview payload). */
export function patternActiveSteps(pattern: DrumPattern, sampleKey: DrumSampleKey): number[] {
  return normalizeDrumPattern(pattern).steps[sampleKey]
    .map((active, index) => (active ? index : -1))
    .filter(index => index >= 0);
}

/** Serialize pattern lanes for native upsert/preview: { kick: [0,4], snare: [4], ... }. */
export function patternStepsPayload(
  pattern: DrumPattern,
): Record<string, number[]> {
  const payload: Record<string, number[]> = {};
  DRUM_SAMPLE_KEYS.forEach(key => {
    const steps = patternActiveSteps(pattern, key);
    if (steps.length > 0) {
      payload[key] = steps;
    }
  });
  return payload;
}

/** Snap block length to whole sixteenth steps (min one step). */
export function snapLengthToSteps(lengthBeats: number): number {
  const steps = Math.max(1, Math.round(lengthBeats / BEATS_PER_STEP));
  return steps * BEATS_PER_STEP;
}

/** Number of full bars that fit in a block length (for mini-grid loop rendering). */
export function barCountForLength(lengthBeats: number): number {
  return Math.max(1, Math.ceil(lengthBeats / BEATS_PER_BAR));
}
