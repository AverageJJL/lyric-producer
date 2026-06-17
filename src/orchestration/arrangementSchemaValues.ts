import {DRUM_SAMPLE_KEYS} from '../assets/drumKit';
import type {DrumPattern} from '../music/drumPatterns';
import {STEPS_PER_BAR} from '../music/drumPatterns';
import type {SamplerSliceIntent} from '../music/samplerSlicing';
import type {TrackTemplateId} from '../music/trackTemplates';
import type {DAWNote} from '../store/useDAWStore';
import {SNAP_GRID_OPTIONS, type SnapGrid} from '../ui/snapGrid';
import {
  add,
  exactKeys,
  numberField,
  optionalString,
  record,
  stringField,
  type ArrangementValidationError,
} from './schemaValidation';

export const TRACK_TEMPLATE_IDS = new Set<TrackTemplateId>([
  'voice_audio',
  'virtual_instrument',
  'drum_machine',
]);

export const SNAP_GRIDS = new Set<SnapGrid>(SNAP_GRID_OPTIONS.map(option => option.value));

function note(value: unknown, path: string, errors: ArrangementValidationError[]): DAWNote | null {
  if (!record(value)) {
    return add(errors, path, 'Expected a note object.');
  }
  exactKeys(value, path, ['note', 'velocity', 'startBeat', 'lengthBeats'], errors);
  const pitch = numberField(value, 'note', path, errors, 0);
  const velocity = numberField(value, 'velocity', path, errors, 0);
  const startBeat = numberField(value, 'startBeat', path, errors, 0);
  const lengthBeats = numberField(value, 'lengthBeats', path, errors, 0.000001);
  if (pitch === null || velocity === null || startBeat === null || lengthBeats === null) {
    return null;
  }
  if (!Number.isInteger(pitch) || pitch > 127) {
    return add(errors, `${path}.note`, 'Expected MIDI note 0-127.');
  }
  if (!Number.isInteger(velocity) || velocity > 127) {
    return add(errors, `${path}.velocity`, 'Expected velocity 0-127.');
  }
  return {note: pitch, velocity, startBeat, lengthBeats};
}

export function midiClip(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (!record(value)) {
    return add(errors, path, 'Expected a MIDI clip object.');
  }
  exactKeys(value, path, ['id', 'trackId', 'name', 'startBeat', 'lengthBeats', 'notes'], errors);
  const id = stringField(value, 'id', path, errors);
  const trackId = stringField(value, 'trackId', path, errors);
  const name = stringField(value, 'name', path, errors);
  const startBeat = numberField(value, 'startBeat', path, errors, 0);
  const lengthBeats = numberField(value, 'lengthBeats', path, errors, 0.000001);
  const rawNotes = Array.isArray(value.notes)
    ? value.notes.map((item, index) => note(item, `${path}.notes[${index}]`, errors))
    : add(errors, `${path}.notes`, 'Expected an array of notes.');
  if (!id || !trackId || !name || startBeat === null || lengthBeats === null || rawNotes === null) {
    return null;
  }
  const notes = rawNotes.filter(item => item !== null);
  return notes.length === rawNotes.length ? {id, trackId, name, startBeat, lengthBeats, notes} : null;
}

export function drumClip(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (!record(value)) {
    return add(errors, path, 'Expected a drum clip object.');
  }
  exactKeys(value, path, ['id', 'trackId', 'name', 'startBeat', 'lengthBeats', 'patternId'], errors);
  const id = stringField(value, 'id', path, errors);
  const trackId = stringField(value, 'trackId', path, errors);
  const name = stringField(value, 'name', path, errors);
  const patternId = stringField(value, 'patternId', path, errors);
  const startBeat = numberField(value, 'startBeat', path, errors, 0);
  const lengthBeats = numberField(value, 'lengthBeats', path, errors, 0.000001);
  return id && trackId && name && patternId && startBeat !== null && lengthBeats !== null
    ? {id, trackId, name, startBeat, lengthBeats, patternId}
    : null;
}

function optionalNumber(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: ArrangementValidationError[],
): number | undefined | null {
  if (value[key] === undefined) {
    return undefined;
  }
  return numberField(value, key, path, errors);
}

function samplerSlice(
  value: unknown,
  path: string,
  errors: ArrangementValidationError[],
): SamplerSliceIntent | null {
  if (!record(value)) {
    return add(errors, path, 'Expected a sampler slice object.');
  }
  exactKeys(value, path, [
    'id', 'name', 'sourceStartBeat', 'sourceLengthBeats',
    'triggerNote', 'velocity', 'clipStartBeat', 'clipLengthBeats', 'gainDb',
  ], errors);
  const sourceStartBeat = numberField(value, 'sourceStartBeat', path, errors, 0);
  const sourceLengthBeats = numberField(value, 'sourceLengthBeats', path, errors, 0.000001);
  const triggerNote = optionalNumber(value, 'triggerNote', path, errors);
  const velocity = optionalNumber(value, 'velocity', path, errors);
  const clipStartBeat = optionalNumber(value, 'clipStartBeat', path, errors);
  const clipLengthBeats = optionalNumber(value, 'clipLengthBeats', path, errors);
  const gainDb = optionalNumber(value, 'gainDb', path, errors);
  if (triggerNote !== undefined && triggerNote !== null &&
      (!Number.isInteger(triggerNote) || triggerNote > 127)) {
    return add(errors, `${path}.triggerNote`, 'Expected MIDI note 0-127.');
  }
  if (velocity !== undefined && velocity !== null &&
      (!Number.isInteger(velocity) || velocity < 1 || velocity > 127)) {
    return add(errors, `${path}.velocity`, 'Expected velocity 1-127.');
  }
  return sourceStartBeat !== null && sourceLengthBeats !== null &&
    triggerNote !== null && velocity !== null && clipStartBeat !== null &&
    clipLengthBeats !== null && gainDb !== null
    ? {
        id: optionalString(value, 'id'),
        name: optionalString(value, 'name'),
        sourceStartBeat,
        sourceLengthBeats,
        triggerNote,
        velocity,
        clipStartBeat,
        clipLengthBeats,
        gainDb,
      }
    : null;
}

export function samplerSlices(
  value: unknown,
  path: string,
  errors: ArrangementValidationError[],
): SamplerSliceIntent[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return add(errors, path, 'Expected one or more sampler slices.');
  }
  const parsed = value.map((item, index) => samplerSlice(item, `${path}[${index}]`, errors));
  return parsed.every(item => item !== null) ? parsed : null;
}

export function timeSignature(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (!record(value)) {
    return add(errors, path, 'Expected a time signature object.');
  }
  exactKeys(value, path, ['numerator', 'denominator'], errors);
  const numerator = numberField(value, 'numerator', path, errors, 1);
  const denominator = numberField(value, 'denominator', path, errors, 1);
  const allowedDenominators = new Set([1, 2, 4, 8, 16, 32]);
  if (
    numerator === null ||
    denominator === null ||
    !Number.isInteger(numerator) ||
    !Number.isInteger(denominator) ||
    !allowedDenominators.has(denominator)
  ) {
    return add(errors, path, 'Expected integer numerator and standard denominator.');
  }
  return {numerator, denominator};
}

export function scale(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (value === null) {
    return null;
  }
  if (!record(value)) {
    return add(errors, path, 'Expected a scale object or null.');
  }
  exactKeys(value, path, ['root', 'mode'], errors);
  const root = stringField(value, 'root', path, errors);
  const mode = stringField(value, 'mode', path, errors);
  return root && mode ? {root, mode} : null;
}

export function chord(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (value === null) {
    return null;
  }
  if (!record(value)) {
    return add(errors, path, 'Expected a chord object or null.');
  }
  exactKeys(value, path, ['symbol'], errors);
  const symbol = stringField(value, 'symbol', path, errors);
  return symbol ? {symbol} : null;
}

export function sections(value: unknown, path: string, errors: ArrangementValidationError[]) {
  if (!Array.isArray(value)) {
    return add(errors, path, 'Expected an array of section markers.');
  }
  const parsed = value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    if (!record(item)) {
      return add(errors, itemPath, 'Expected a section marker object.');
    }
    exactKeys(item, itemPath, ['id', 'name', 'startBeat', 'lengthBeats'], errors);
    const id = stringField(item, 'id', itemPath, errors);
    const name = stringField(item, 'name', itemPath, errors);
    const startBeat = numberField(item, 'startBeat', itemPath, errors, 0);
    const lengthBeats = numberField(item, 'lengthBeats', itemPath, errors, 0.000001);
    return id && name && startBeat !== null && lengthBeats !== null
      ? {id, name, startBeat, lengthBeats}
      : null;
  });
  return parsed.every(item => item !== null) ? parsed : null;
}

export function drumPattern(
  value: unknown,
  path: string,
  errors: ArrangementValidationError[],
): DrumPattern | null {
  if (!record(value) || !record(value.steps)) {
    return add(errors, path, 'Expected a drum pattern object with steps.');
  }
  exactKeys(value, path, ['id', 'name', 'steps'], errors);
  exactKeys(value.steps, `${path}.steps`, [...DRUM_SAMPLE_KEYS], errors);
  const id = stringField(value, 'id', path, errors);
  const name = stringField(value, 'name', path, errors);
  const steps = {} as DrumPattern['steps'];
  DRUM_SAMPLE_KEYS.forEach(key => {
    const row = value.steps[key];
    if (!Array.isArray(row) || row.length !== STEPS_PER_BAR || row.some(item => typeof item !== 'boolean')) {
      add(errors, `${path}.steps.${key}`, `Expected ${STEPS_PER_BAR} booleans.`);
      return;
    }
    steps[key] = [...row];
  });
  return id && name && Object.keys(steps).length === DRUM_SAMPLE_KEYS.length
    ? {id, name, steps}
    : null;
}
