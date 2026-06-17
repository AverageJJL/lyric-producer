import {
  copyPianoRollNotes,
  deletePianoRollNotes,
  duplicatePianoRollNotes,
  legatoSelectedPianoRollNotes,
  movePianoRollNotes,
  pastePianoRollNotes,
  quantizeSelectedPianoRollNotes,
  resizePianoRollNotes,
} from '../src/arrangement/midiNoteEditCommands';
import type {DAWNote} from '../src/store/useDAWStore';

const notes: DAWNote[] = [
  {note: 60, velocity: 90, startBeat: 0.13, lengthBeats: 0.5},
  {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.75},
  {note: 67, velocity: 70, startBeat: 3.5, lengthBeats: 0.5},
];

describe('midi note edit commands', () => {
  it('deletes selected note indexes only', () => {
    expect(deletePianoRollNotes(notes, [0, 2])).toEqual([notes[1]]);
  });

  it('moves selected notes as a clamped group', () => {
    const moved = movePianoRollNotes(notes, [0, 1], -2, 80, 4);

    expect(moved[0]).toMatchObject({note: 123, startBeat: 0});
    expect(moved[1]).toMatchObject({note: 127, startBeat: 0.87});
    expect(moved[2]).toBe(notes[2]);
  });

  it('resizes note ends and starts without crossing the minimum length', () => {
    const endResized = resizePianoRollNotes(notes, [0], 'end', 1, 4);
    const startResized = resizePianoRollNotes(notes, [1], 'start', 5, 4);

    expect(endResized[0]).toMatchObject({startBeat: 0.13, lengthBeats: 1.5});
    expect(startResized[1]).toMatchObject({startBeat: 1.625, lengthBeats: 0.125});
  });

  it('quantizes selected notes and falls back to all notes when nothing is selected', () => {
    expect(quantizeSelectedPianoRollNotes(notes, [0], 4)[0]?.startBeat).toBe(0.25);
    expect(quantizeSelectedPianoRollNotes(notes, [], 4)[0]?.startBeat).toBe(0.25);
  });

  it('applies legato to selected notes only when multiple notes are selected', () => {
    const edited = legatoSelectedPianoRollNotes(notes, [0, 1], 4);

    expect(edited[0]?.lengthBeats).toBe(0.87);
    expect(edited[1]?.lengthBeats).toBe(3);
    expect(edited[2]).toBe(notes[2]);
  });

  it('copies and pastes notes at a requested insert beat', () => {
    const clipboard = copyPianoRollNotes(notes, [0, 1]);
    const pasted = pastePianoRollNotes(notes, clipboard, 4, 2);

    expect(pasted.pastedIndexes).toEqual([3, 4]);
    expect(pasted.notes[3]).toMatchObject({note: 60, startBeat: 2});
    expect(pasted.notes[4]).toMatchObject({note: 64, startBeat: 2.87});
  });

  it('duplicates notes after the selected group when no insert beat is provided', () => {
    const duplicated = duplicatePianoRollNotes(notes, [0, 1], 4);

    expect(duplicated.duplicatedIndexes).toEqual([3, 4]);
    expect(duplicated.notes[3]?.startBeat).toBe(1.75);
    expect(duplicated.notes[4]?.startBeat).toBe(2.62);
  });
});
