import type React from 'react';

import {
  copyPianoRollNotes,
  deletePianoRollNotes,
  duplicatePianoRollNotes,
  legatoSelectedPianoRollNotes,
  movePianoRollNotes,
  pastePianoRollNotes,
  quantizeSelectedPianoRollNotes,
  resizePianoRollNotes,
  transposeSelectedPianoRollNotes,
  type PianoRollNoteClipboard,
} from '../../arrangement/midiNoteEditCommands';
import type {DAWNote} from '../../store/useDAWStore';

type PianoRollShortcutContext = {
  notes: DAWNote[];
  selectedIndexes: number[];
  hasActiveNote: boolean;
  noteClipboard: PianoRollNoteClipboard | null;
  clipLengthBeats: number;
  playheadRelativeBeat: number | null;
  setNoteClipboard: (clipboard: PianoRollNoteClipboard | null) => void;
  replaceNotes: (notes: DAWNote[], selectedIndexes?: number[]) => void;
  selectIndexes: (indexes: number[], additive: boolean) => void;
};

function consume(event: React.KeyboardEvent<HTMLElement>): void {
  event.preventDefault();
  event.stopPropagation();
}

export function handlePianoRollShortcut(
  event: React.KeyboardEvent<HTMLElement>,
  context: PianoRollShortcutContext,
): boolean {
  const key = event.key.toLowerCase();
  const mod = event.metaKey || event.ctrlKey;
  const {
    notes,
    selectedIndexes,
    hasActiveNote,
    noteClipboard,
    clipLengthBeats,
    playheadRelativeBeat,
    setNoteClipboard,
    replaceNotes,
    selectIndexes,
  } = context;

  if (mod && key === 'a') {
    consume(event);
    selectIndexes(notes.map((_, index) => index), false);
  } else if (mod && key === 'c') {
    consume(event);
    setNoteClipboard(copyPianoRollNotes(notes, selectedIndexes));
  } else if (mod && key === 'x') {
    consume(event);
    setNoteClipboard(copyPianoRollNotes(notes, selectedIndexes));
    replaceNotes(deletePianoRollNotes(notes, selectedIndexes));
  } else if (mod && key === 'v') {
    consume(event);
    const pasted = pastePianoRollNotes(notes, noteClipboard, clipLengthBeats, playheadRelativeBeat ?? undefined);
    replaceNotes(pasted.notes, pasted.pastedIndexes);
  } else if (mod && key === 'd') {
    consume(event);
    const duplicated = duplicatePianoRollNotes(notes, selectedIndexes, clipLengthBeats);
    replaceNotes(duplicated.notes, duplicated.duplicatedIndexes);
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    consume(event);
    replaceNotes(deletePianoRollNotes(notes, selectedIndexes));
  } else if (key === 'q') {
    consume(event);
    replaceNotes(quantizeSelectedPianoRollNotes(notes, selectedIndexes, clipLengthBeats), selectedIndexes);
  } else if (key === 'l') {
    consume(event);
    replaceNotes(legatoSelectedPianoRollNotes(notes, selectedIndexes, clipLengthBeats), selectedIndexes);
  } else if (hasActiveNote && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    consume(event);
    const semitones = (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey ? 12 : 1);
    replaceNotes(transposeSelectedPianoRollNotes(notes, selectedIndexes, semitones), selectedIndexes);
  } else if (hasActiveNote && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    consume(event);
    const beatDelta = (event.key === 'ArrowRight' ? 1 : -1) * (event.altKey ? 0.125 : 0.25);
    const edited = event.shiftKey
      ? resizePianoRollNotes(notes, selectedIndexes, 'end', beatDelta, clipLengthBeats)
      : movePianoRollNotes(notes, selectedIndexes, beatDelta, 0, clipLengthBeats);
    replaceNotes(edited, selectedIndexes);
  } else {
    return false;
  }

  return true;
}
