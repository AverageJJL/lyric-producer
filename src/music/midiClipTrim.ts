import type {DAWBlock, DAWNote} from '../store/useDAWStore';

/**
 * Rebase MIDI notes into a clipped absolute beat window.
 * Left-edge clip trims move the clip start, but the musical notes should stay
 * locked to the timeline rather than sliding with the new relative origin.
 */
export function trimNotesToAbsoluteRange(
  block: Pick<DAWBlock, 'notes' | 'startBeat'>,
  rangeStartBeat: number,
  rangeEndBeat: number,
): DAWNote[] | undefined {
  if (!block.notes) {
    return undefined;
  }

  return block.notes.flatMap(note => {
    const noteStart = block.startBeat + note.startBeat;
    const noteEnd = noteStart + note.lengthBeats;
    const trimmedStart = Math.max(noteStart, rangeStartBeat);
    const trimmedEnd = Math.min(noteEnd, rangeEndBeat);
    if (trimmedStart >= trimmedEnd) {
      return [];
    }

    return [{
      ...note,
      startBeat: trimmedStart - rangeStartBeat,
      lengthBeats: trimmedEnd - trimmedStart,
    }];
  });
}
