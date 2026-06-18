import {BEATS_PER_BAR} from './drumPatterns';
import {clampNoteNumber, clampVelocity, quantizeBeat} from './noteUtils';
import type {DAWNote} from '../store/useDAWStore';
import type {TimeSignature} from '../store/projectMetadata';

/** Default sixteenth-note grid for generated MIDI (matches drum step grid). */
export const DEFAULT_MIDI_GRID_BEATS = 0.25;

/** Extra beats after the last note end so the clip edge does not cover the final note bar. */
/** One quarter-note of space after the last note (Logic-style region tail room). */
export const MIDI_CLIP_TAIL_PADDING_BEATS = 1;

/** Standard MIDI ticks per quarter note when converting AI payloads. */
export const DEFAULT_PPQ = 480;

export type MidiQuantizeMode = 'classic' | 'smart' | 'none';

export type RawMidiNoteInput = {
  note?: number;
  pitch?: number;
  velocity?: number;
  startBeat?: number;
  lengthBeats?: number;
  start_tick?: number;
  duration_ticks?: number;
};

export type NormalizeMidiContext = {
  gridBeats?: number;
  quantizeMode?: MidiQuantizeMode;
  smartStrength?: number;
  smartRangeBeats?: number;
  ppq?: number;
  bpm?: number;
  timeSignature?: TimeSignature;
  minClipBeats?: number;
  barBeats?: number;
  requestedLengthBeats?: number;
  respectRequestedLength?: boolean;
  tailPaddingBeats?: number;
};

export type NormalizedMidiClip = {
  notes: DAWNote[];
  lengthBeats: number;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** AI payloads may use pitch/start_tick; arrangement uses note/startBeat. */
export function rawNoteToClipLocalBeats(
  raw: RawMidiNoteInput,
  ppq = DEFAULT_PPQ,
): {note: number; velocity: number; startBeat: number; lengthBeats: number} | null {
  const noteNumber = raw.note ?? raw.pitch;
  if (!isFiniteNumber(noteNumber)) {
    return null;
  }

  let startBeat = raw.startBeat;
  let lengthBeats = raw.lengthBeats;

  if (!isFiniteNumber(startBeat) && isFiniteNumber(raw.start_tick)) {
    startBeat = raw.start_tick / ppq;
  }
  if (!isFiniteNumber(lengthBeats) && isFiniteNumber(raw.duration_ticks)) {
    lengthBeats = raw.duration_ticks / ppq;
  }

  if (!isFiniteNumber(startBeat) || !isFiniteNumber(lengthBeats)) {
    return null;
  }
  if (lengthBeats <= 0) {
    return null;
  }

  return {
    note: clampNoteNumber(noteNumber),
    velocity: clampVelocity(raw.velocity ?? 100),
    startBeat,
    lengthBeats,
  };
}

export function classicQuantizeNotes(notes: DAWNote[], gridBeats = DEFAULT_MIDI_GRID_BEATS): DAWNote[] {
  return notes.map(note => ({
    ...note,
    startBeat: quantizeBeat(note.startBeat, gridBeats),
  }));
}

/**
 * Smart quantize: events near a grid line move proportionally toward it (Logic-style),
 * preserving order and local offsets within a proximity window.
 */
export function smartQuantizeNotes(
  notes: DAWNote[],
  gridBeats = DEFAULT_MIDI_GRID_BEATS,
  strength = 0.85,
  rangeBeats = gridBeats * 0.45,
): DAWNote[] {
  if (gridBeats <= 0 || notes.length === 0) {
    return notes;
  }

  const clampedStrength = Math.min(1, Math.max(0, strength));
  return notes.map(note => {
    const gridIndex = Math.round(note.startBeat / gridBeats);
    const target = gridIndex * gridBeats;
    const delta = target - note.startBeat;
    if (Math.abs(delta) > rangeBeats) {
      return note;
    }
    return {
      ...note,
      startBeat: note.startBeat + delta * clampedStrength,
    };
  });
}

function sortNotes(notes: DAWNote[]): DAWNote[] {
  return [...notes].sort((a, b) => {
    if (a.startBeat !== b.startBeat) {
      return a.startBeat - b.startBeat;
    }
    if (a.note !== b.note) {
      return a.note - b.note;
    }
    return a.lengthBeats - b.lengthBeats;
  });
}

/** Clip notes to [0, clipLength) and drop zero-length results. */
export function trimNotesToClipLength(notes: DAWNote[], clipLengthBeats: number): DAWNote[] {
  const trimmed: DAWNote[] = [];
  for (const note of notes) {
    if (note.startBeat >= clipLengthBeats - 1e-6) {
      continue;
    }
    const endBeat = Math.min(note.startBeat + note.lengthBeats, clipLengthBeats);
    const lengthBeats = endBeat - note.startBeat;
    if (lengthBeats <= 1e-6) {
      continue;
    }
    trimmed.push({...note, lengthBeats});
  }
  return trimmed;
}

export function noteExtentBeats(notes: DAWNote[]): number {
  if (notes.length === 0) {
    return 0;
  }
  return notes.reduce((max, note) => Math.max(max, note.startBeat + note.lengthBeats), 0);
}

/** Clip length from note content plus tail padding (recording + AI clips). */
export function clipLengthFromNoteExtent(
  noteEndBeats: number,
  options?: {minBeats?: number; tailPaddingBeats?: number},
): number {
  const minBeats = options?.minBeats ?? BEATS_PER_BAR;
  const tail = options?.tailPaddingBeats ?? MIDI_CLIP_TAIL_PADDING_BEATS;
  if (noteEndBeats <= 1e-6) {
    return minBeats;
  }
  return Math.max(minBeats, noteEndBeats + tail);
}

/** Round clip length up to full bars with a minimum of one bar when notes exist. */
export function deriveMidiClipLength(
  notes: DAWNote[],
  options?: {
    minBeats?: number;
    barBeats?: number;
    requestedLengthBeats?: number;
    respectRequestedLength?: boolean;
    tailPaddingBeats?: number;
  },
): number {
  const minBeats = options?.minBeats ?? BEATS_PER_BAR;
  const barBeats = options?.barBeats ?? BEATS_PER_BAR;
  const extent = noteExtentBeats(notes);
  const fromNotes =
    extent > 0
      ? Math.ceil(
          clipLengthFromNoteExtent(extent, {
            minBeats,
            tailPaddingBeats: options?.tailPaddingBeats,
          }) / barBeats,
        ) * barBeats
      : minBeats;
  const requested = options?.requestedLengthBeats;
  if (options?.respectRequestedLength !== false && isFiniteNumber(requested) && requested > 0) {
    return Math.max(minBeats, Math.max(requested, fromNotes));
  }
  return Math.max(minBeats, fromNotes);
}

export function normalizeMidiNotes(
  rawNotes: RawMidiNoteInput[],
  context: NormalizeMidiContext = {},
): DAWNote[] {
  const gridBeats = context.gridBeats ?? DEFAULT_MIDI_GRID_BEATS;
  const ppq = context.ppq ?? DEFAULT_PPQ;
  const quantizeMode = context.quantizeMode ?? 'classic';

  const parsed = rawNotes
    .map(raw => rawNoteToClipLocalBeats(raw, ppq))
    .filter((note): note is DAWNote => note !== null)
    .map(note => ({
      note: note.note,
      velocity: note.velocity,
      startBeat: Math.max(0, note.startBeat),
      lengthBeats: note.lengthBeats,
    }));

  let quantized: DAWNote[];
  if (quantizeMode === 'none') {
    quantized = parsed;
  } else if (quantizeMode === 'smart') {
    quantized = smartQuantizeNotes(
      parsed,
      gridBeats,
      context.smartStrength,
      context.smartRangeBeats,
    );
  } else {
    quantized = classicQuantizeNotes(parsed, gridBeats);
  }

  return sortNotes(quantized);
}

/** Full pipeline for scripted/AI clip insertion: parse, quantize, length, trim. */
export function normalizeMidiClip(
  rawNotes: RawMidiNoteInput[],
  context: NormalizeMidiContext = {},
): NormalizedMidiClip {
  const notes = normalizeMidiNotes(rawNotes, context);
  const lengthBeats = deriveMidiClipLength(notes, {
    minBeats: context.minClipBeats ?? BEATS_PER_BAR,
    barBeats: context.barBeats,
    requestedLengthBeats: context.requestedLengthBeats,
    respectRequestedLength: context.respectRequestedLength,
    tailPaddingBeats: context.tailPaddingBeats,
  });
  const trimmed = trimNotesToClipLength(notes, lengthBeats);
  return {notes: trimmed, lengthBeats};
}
