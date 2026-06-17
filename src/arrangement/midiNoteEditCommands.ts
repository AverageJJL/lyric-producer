import {
  DEFAULT_NOTE_LENGTH_BEATS,
  clampNoteNumber,
  clampVelocity,
  quantizeBeat,
} from '../music/noteUtils';
import type {DAWNote} from '../store/useDAWStore';

const MIN_NOTE_LENGTH_BEATS = 0.125;
const PIANO_ROLL_DUPLICATE_GRID_STEP_BEATS = 0.25;

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function sanitizePianoRollNote(
  note: Partial<DAWNote>,
  clipLengthBeats: number,
): DAWNote {
  const safeClipLength = Math.max(MIN_NOTE_LENGTH_BEATS, clipLengthBeats);
  const startBeat = clamp(finiteOr(note.startBeat, 0), 0, safeClipLength - MIN_NOTE_LENGTH_BEATS);
  const maxLength = Math.max(MIN_NOTE_LENGTH_BEATS, safeClipLength - startBeat);
  return {
    note: clampNoteNumber(finiteOr(note.note, 60)),
    velocity: clampVelocity(finiteOr(note.velocity, 100)),
    startBeat,
    lengthBeats: clamp(
      finiteOr(note.lengthBeats, DEFAULT_NOTE_LENGTH_BEATS),
      MIN_NOTE_LENGTH_BEATS,
      maxLength,
    ),
  };
}

export function createPianoRollNote(
  playheadBeat: number,
  clipStartBeat: number,
  clipLengthBeats: number,
): DAWNote {
  return sanitizePianoRollNote(
    {
      note: 60,
      velocity: 100,
      startBeat: quantizeBeat(Math.max(0, playheadBeat - clipStartBeat)),
      lengthBeats: DEFAULT_NOTE_LENGTH_BEATS,
    },
    clipLengthBeats,
  );
}

export function quantizePianoRollNotes(
  notes: DAWNote[],
  clipLengthBeats: number,
  gridBeats = 0.25,
): DAWNote[] {
  return notes.map(note =>
    sanitizePianoRollNote(
      {...note, startBeat: quantizeBeat(note.startBeat, gridBeats)},
      clipLengthBeats,
    ),
  );
}

export function transposePianoRollNotes(notes: DAWNote[], semitones: number): DAWNote[] {
  return notes.map(note => ({
    ...note,
    note: clampNoteNumber(note.note + semitones),
  }));
}

export function legatoPianoRollNotes(
  notes: DAWNote[],
  clipLengthBeats: number,
): DAWNote[] {
  const starts = [...new Set(notes.map(note => note.startBeat).sort((a, b) => a - b))];
  return notes.map(note => {
    const nextStart = starts.find(start => start > note.startBeat + 1e-6) ?? clipLengthBeats;
    return sanitizePianoRollNote(
      {...note, lengthBeats: Math.max(MIN_NOTE_LENGTH_BEATS, nextStart - note.startBeat)},
      clipLengthBeats,
    );
  });
}

function selectedIndexes(notes: DAWNote[], indexes: Iterable<number>): number[] {
  return [...new Set(indexes)].filter(index => index >= 0 && index < notes.length).sort((a, b) => a - b);
}

function selectedOrAllIndexes(notes: DAWNote[], indexes: Iterable<number>): number[] {
  const selected = selectedIndexes(notes, indexes);
  return selected.length > 0 ? selected : notes.map((_, index) => index);
}

export function deletePianoRollNotes(notes: DAWNote[], indexes: Iterable<number>): DAWNote[] {
  const remove = new Set(selectedIndexes(notes, indexes));
  return notes.filter((_, index) => !remove.has(index));
}

export function updatePianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  updater: (note: DAWNote, index: number) => Partial<DAWNote>,
  clipLengthBeats: number,
): DAWNote[] {
  const update = new Set(selectedIndexes(notes, indexes));
  return notes.map((note, index) =>
    update.has(index) ? sanitizePianoRollNote({...note, ...updater(note, index)}, clipLengthBeats) : note,
  );
}

export function quantizeSelectedPianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  clipLengthBeats: number,
  gridBeats = 0.25,
): DAWNote[] {
  return updatePianoRollNotes(
    notes,
    selectedOrAllIndexes(notes, indexes),
    note => ({startBeat: quantizeBeat(note.startBeat, gridBeats)}),
    clipLengthBeats,
  );
}

export function legatoSelectedPianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  clipLengthBeats: number,
): DAWNote[] {
  const selected = selectedIndexes(notes, indexes);
  if (selected.length < 2) {
    return legatoPianoRollNotes(notes, clipLengthBeats);
  }

  const selectedStarts = [...new Set(selected.map(index => notes[index]?.startBeat ?? 0))]
    .sort((a, b) => a - b);
  const update = new Set(selected);
  return notes.map((note, index) => {
    if (!update.has(index)) {
      return note;
    }
    const nextStart = selectedStarts.find(start => start > note.startBeat + 1e-6) ?? clipLengthBeats;
    return sanitizePianoRollNote(
      {...note, lengthBeats: Math.max(MIN_NOTE_LENGTH_BEATS, nextStart - note.startBeat)},
      clipLengthBeats,
    );
  });
}

export function transposeSelectedPianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  semitones: number,
): DAWNote[] {
  const selected = selectedOrAllIndexes(notes, indexes);
  return updatePianoRollNotes(notes, selected, note => ({note: note.note + semitones}), Number.MAX_SAFE_INTEGER);
}

export function movePianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  beatDelta: number,
  noteDelta: number,
  clipLengthBeats: number,
): DAWNote[] {
  const selected = selectedIndexes(notes, indexes);
  if (selected.length === 0) {
    return notes;
  }

  const selectedNotes = selected.map(index => notes[index]);
  const minStart = Math.min(...selectedNotes.map(note => note.startBeat));
  const maxEnd = Math.max(...selectedNotes.map(note => note.startBeat + note.lengthBeats));
  const minNote = Math.min(...selectedNotes.map(note => note.note));
  const maxNote = Math.max(...selectedNotes.map(note => note.note));
  const safeBeatDelta = clamp(beatDelta, -minStart, Math.max(0, clipLengthBeats - maxEnd));
  const safeNoteDelta = clamp(noteDelta, -minNote, 127 - maxNote);

  return updatePianoRollNotes(
    notes,
    selected,
    note => ({note: note.note + safeNoteDelta, startBeat: note.startBeat + safeBeatDelta}),
    clipLengthBeats,
  );
}

export function resizePianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  edge: 'start' | 'end',
  beatDelta: number,
  clipLengthBeats: number,
): DAWNote[] {
  return updatePianoRollNotes(
    notes,
    indexes,
    note => {
      if (edge === 'end') {
        return {lengthBeats: note.lengthBeats + beatDelta};
      }
      const endBeat = note.startBeat + note.lengthBeats;
      const startBeat = clamp(note.startBeat + beatDelta, 0, endBeat - MIN_NOTE_LENGTH_BEATS);
      return {startBeat, lengthBeats: endBeat - startBeat};
    },
    clipLengthBeats,
  );
}

export type PianoRollNoteClipboard = {
  notes: DAWNote[];
  startBeat: number;
  spanBeats: number;
};

export function copyPianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
): PianoRollNoteClipboard | null {
  const selected = selectedIndexes(notes, indexes);
  if (selected.length === 0) {
    return null;
  }
  const copied = selected.map(index => notes[index]).sort((a, b) => a.startBeat - b.startBeat || a.note - b.note);
  const startBeat = Math.min(...copied.map(note => note.startBeat));
  const endBeat = Math.max(...copied.map(note => note.startBeat + note.lengthBeats));
  return {notes: copied.map(note => ({...note})), startBeat, spanBeats: Math.max(MIN_NOTE_LENGTH_BEATS, endBeat - startBeat)};
}

export function pastePianoRollNotes(
  notes: DAWNote[],
  clipboard: PianoRollNoteClipboard | null,
  clipLengthBeats: number,
  insertBeat?: number,
): {notes: DAWNote[]; pastedIndexes: number[]} {
  if (!clipboard || clipboard.notes.length === 0) {
    return {notes, pastedIndexes: []};
  }

  const fallbackBeat = clipboard.startBeat + clipboard.spanBeats;
  const rawStart = finiteOr(insertBeat, fallbackBeat);
  const maxStart = Math.max(0, clipLengthBeats - clipboard.spanBeats);
  const targetStart = clamp(quantizeBeat(rawStart), 0, maxStart);
  const pasted = clipboard.notes.map(note =>
    sanitizePianoRollNote({...note, startBeat: targetStart + (note.startBeat - clipboard.startBeat)}, clipLengthBeats),
  );
  const pastedIndexes = pasted.map((_, offset) => notes.length + offset);
  return {notes: [...notes, ...pasted], pastedIndexes};
}

export function duplicatePianoRollNotes(
  notes: DAWNote[],
  indexes: Iterable<number>,
  clipLengthBeats: number,
  insertBeat?: number,
): {notes: DAWNote[]; duplicatedIndexes: number[]} {
  const clipboard = copyPianoRollNotes(notes, indexes);
  const duplicateBeat = clipboard
    ? clipboard.startBeat + Math.max(PIANO_ROLL_DUPLICATE_GRID_STEP_BEATS, clipboard.spanBeats)
    : insertBeat;
  const result = pastePianoRollNotes(notes, clipboard, clipLengthBeats, insertBeat ?? duplicateBeat);
  return {notes: result.notes, duplicatedIndexes: result.pastedIndexes};
}
