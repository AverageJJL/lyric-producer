import type {ArrangementOperation} from '../arrangement/operations';
import {
  SNAP_GRIDS,
  TRACK_TEMPLATE_IDS,
  chord,
  drumClip,
  drumPattern,
  midiClip,
  scale,
  sections,
  samplerSlices,
  timeSignature,
} from './arrangementSchemaValues';
import {
  add,
  booleanField,
  exactKeys,
  numberField,
  oneOf,
  optionalString,
  record,
  stringField,
  type ArrangementValidationError,
} from './schemaValidation';

export type {ArrangementValidationError} from './schemaValidation';

export type ArrangementValidationResult =
  | {ok: true; operations: ArrangementOperation[]}
  | {ok: false; errors: ArrangementValidationError[]};

const PERFORMANCE_MODES = new Set(['linear', 'looper'] as const);

function opIds(value: Record<string, unknown>, path: string, errors: ArrangementValidationError[]) {
  const trackId = stringField(value, 'trackId', path, errors);
  const instrumentId = stringField(value, 'instrumentId', path, errors);
  return trackId && instrumentId ? {trackId, instrumentId} : null;
}

function operation(
  value: unknown,
  index: number,
  errors: ArrangementValidationError[],
): ArrangementOperation | null {
  const path = `operations[${index}]`;
  if (!record(value)) {
    return add(errors, path, 'Expected an operation object.');
  }
  const op = stringField(value, 'op', path, errors);
  if (!op) {
    return null;
  }
  switch (op) {
    case 'createTrack': {
      exactKeys(value, path, ['op', 'templateId', 'trackId', 'instrumentId', 'presetId', 'name'], errors);
      const templateId = oneOf(value, 'templateId', TRACK_TEMPLATE_IDS, path, errors);
      return templateId
        ? {
            op,
            templateId,
            trackId: optionalString(value, 'trackId'),
            instrumentId: optionalString(value, 'instrumentId'),
            presetId: optionalString(value, 'presetId'),
            name: optionalString(value, 'name'),
          }
        : null;
    }
    case 'deleteTrack':
    case 'deleteClip': {
      const key = op === 'deleteTrack' ? 'trackId' : 'clipId';
      exactKeys(value, path, ['op', key], errors);
      const id = stringField(value, key, path, errors);
      return id ? ({op, [key]: id} as ArrangementOperation) : null;
    }
    case 'setTrackInstrument': {
      exactKeys(value, path, ['op', 'trackId', 'instrumentId', 'presetId'], errors);
      const ids = opIds(value, path, errors);
      return ids ? {op, ...ids, presetId: optionalString(value, 'presetId')} : null;
    }
    case 'setTrackPreset':
    case 'setTrackLocked':
    case 'setClipLocked': {
      const idKey = op === 'setClipLocked' ? 'clipId' : 'trackId';
      const valueKey = op === 'setTrackPreset' ? 'presetId' : 'isLocked';
      exactKeys(value, path, ['op', idKey, valueKey], errors);
      if (op === 'setClipLocked') {
        const clipId = stringField(value, 'clipId', path, errors);
        const isLocked = booleanField(value, 'isLocked', path, errors);
        return clipId && isLocked !== null ? {op, clipId, isLocked} : null;
      }
      const trackId = stringField(value, 'trackId', path, errors);
      if (op === 'setTrackPreset') {
        const presetId = stringField(value, 'presetId', path, errors);
        return trackId && presetId ? {op, trackId, presetId} : null;
      }
      const isLocked = booleanField(value, 'isLocked', path, errors);
      return trackId && isLocked !== null ? {op, trackId, isLocked} : null;
    }
    case 'setBpm': {
      exactKeys(value, path, ['op', 'bpm'], errors);
      const bpm = numberField(value, 'bpm', path, errors, 1);
      return bpm !== null ? {op, bpm} : null;
    }
    case 'setMasterMix': {
      exactKeys(value, path, ['op', 'volumeDb', 'pan'], errors);
      const volumeDb = numberField(value, 'volumeDb', path, errors);
      const pan = numberField(value, 'pan', path, errors, -1);
      return volumeDb !== null && pan !== null && pan <= 1
        ? {op, volumeDb, pan}
        : add(errors, `${path}.pan`, 'Expected pan between -1 and 1.');
    }
    case 'setSnapGrid': {
      exactKeys(value, path, ['op', 'snapGrid'], errors);
      const snapGrid = oneOf(value, 'snapGrid', SNAP_GRIDS, path, errors);
      return snapGrid ? {op, snapGrid} : null;
    }
    case 'setRelativeSnap':
    case 'setTransport': {
      const key = op === 'setRelativeSnap' ? 'enabled' : 'isPlaying';
      exactKeys(value, path, ['op', key], errors);
      const flag = booleanField(value, key, path, errors);
      return flag !== null ? ({op, [key]: flag} as ArrangementOperation) : null;
    }
    case 'setPerformanceMode': {
      exactKeys(value, path, ['op', 'mode', 'looperLengthBars'], errors);
      const mode = oneOf(value, 'mode', PERFORMANCE_MODES, path, errors);
      const rawBars = value.looperLengthBars;
      if (rawBars === undefined) {
        return mode ? {op, mode} : null;
      }
      const bars = numberField(value, 'looperLengthBars', path, errors, 4);
      if (!mode || bars === null) {
        return null;
      }
      return bars === 4 || bars === 8
        ? {op, mode, looperLengthBars: bars}
        : add(errors, `${path}.looperLengthBars`, 'Expected looperLengthBars 4 or 8.');
    }
    case 'setCycle': {
      exactKeys(value, path, ['op', 'enabled', 'startBeat', 'endBeat'], errors);
      const enabled = booleanField(value, 'enabled', path, errors);
      const startBeat = numberField(value, 'startBeat', path, errors, 0);
      const endBeat = numberField(value, 'endBeat', path, errors, 0);
      return enabled !== null && startBeat !== null && endBeat !== null && endBeat > startBeat
        ? {op, enabled, startBeat, endBeat}
        : add(errors, path, 'Expected cycle endBeat greater than startBeat.');
    }
    case 'setPlayheadBeat': {
      exactKeys(value, path, ['op', 'beat'], errors);
      const beat = numberField(value, 'beat', path, errors, 0);
      return beat !== null ? {op, beat} : null;
    }
    case 'setTimeSignature': {
      exactKeys(value, path, ['op', 'timeSignature'], errors);
      const parsed = timeSignature(value.timeSignature, `${path}.timeSignature`, errors);
      return parsed ? {op, timeSignature: parsed} : null;
    }
    case 'setScale':
    case 'setChord': {
      exactKeys(value, path, ['op', op === 'setScale' ? 'scale' : 'chord'], errors);
      return op === 'setScale'
        ? {op, scale: scale(value.scale, `${path}.scale`, errors)}
        : {op, chord: chord(value.chord, `${path}.chord`, errors)};
    }
    case 'setSections': {
      exactKeys(value, path, ['op', 'sections'], errors);
      const parsed = sections(value.sections, `${path}.sections`, errors);
      return parsed ? {op, sections: parsed} : null;
    }
    case 'upsertMidiClip': {
      exactKeys(value, path, ['op', 'clip'], errors);
      const clip = midiClip(value.clip, `${path}.clip`, errors);
      return clip ? {op, clip} : null;
    }
    case 'createSamplerFromSlices': {
      exactKeys(value, path, [
        'op', 'sourceClipId', 'trackId', 'trackName',
        'clipId', 'clipName', 'startBeat', 'slices',
      ], errors);
      const sourceClipId = stringField(value, 'sourceClipId', path, errors);
      const trackId = stringField(value, 'trackId', path, errors);
      const trackName = stringField(value, 'trackName', path, errors);
      const clipId = stringField(value, 'clipId', path, errors);
      const clipName = stringField(value, 'clipName', path, errors);
      const startBeat = numberField(value, 'startBeat', path, errors, 0);
      const slices = samplerSlices(value.slices, `${path}.slices`, errors);
      return sourceClipId && trackId && trackName && clipId && clipName &&
        startBeat !== null && slices
        ? {op, sourceClipId, trackId, trackName, clipId, clipName, startBeat, slices}
        : null;
    }
    case 'upsertDrumPattern': {
      exactKeys(value, path, ['op', 'pattern'], errors);
      const pattern = drumPattern(value.pattern, `${path}.pattern`, errors);
      return pattern ? {op, pattern} : null;
    }
    case 'upsertDrumClip': {
      exactKeys(value, path, ['op', 'clip'], errors);
      const clip = drumClip(value.clip, `${path}.clip`, errors);
      return clip ? {op, clip} : null;
    }
    case 'moveClip':
    case 'resizeClip': {
      exactKeys(value, path, op === 'moveClip' ? ['op', 'clipId', 'startBeat', 'trackId'] : ['op', 'clipId', 'startBeat', 'lengthBeats'], errors);
      const clipId = stringField(value, 'clipId', path, errors);
      const startBeat = numberField(value, 'startBeat', path, errors, 0);
      if (op === 'moveClip') {
        return clipId && startBeat !== null ? {op, clipId, startBeat, trackId: optionalString(value, 'trackId')} : null;
      }
      const lengthBeats = numberField(value, 'lengthBeats', path, errors, 0.000001);
      return clipId && startBeat !== null && lengthBeats !== null ? {op, clipId, startBeat, lengthBeats} : null;
    }
    default:
      return add(errors, `${path}.op`, `Unsupported operation "${op}".`);
  }
}

export function validateArrangementOperationsPayload(payload: unknown): ArrangementValidationResult {
  const errors: ArrangementValidationError[] = [];
  let raw: unknown[] | null = null;
  if (Array.isArray(payload)) {
    raw = payload;
  } else if (record(payload) && Array.isArray(payload.operations)) {
    exactKeys(payload, '$', ['operations'], errors);
    raw = payload.operations;
  } else {
    add(errors, 'operations', 'Expected an operations array.');
  }
  const operations = raw
    ? raw.map((item, index) => operation(item, index, errors)).filter(item => item !== null)
    : [];
  return errors.length === 0 ? {ok: true, operations} : {ok: false, errors};
}

export function parseArrangementOperationsJson(json: string): ArrangementValidationResult {
  try {
    return validateArrangementOperationsPayload(JSON.parse(json));
  } catch {
    return {ok: false, errors: [{path: '$', message: 'Invalid JSON.'}]};
  }
}
