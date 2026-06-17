import type {DAWNote} from '../store/useDAWStore';

export const DEFAULT_NOTE_LENGTH_BEATS = 0.5;
export const DEFAULT_QUANTIZE_BEATS = 0.25;

export function quantizeBeat(beat: number, gridBeats = DEFAULT_QUANTIZE_BEATS): number {
  if (gridBeats <= 0) {
    return beat;
  }
  return Math.round(beat / gridBeats) * gridBeats;
}

export function clampNoteNumber(note: number): number {
  return Math.min(127, Math.max(0, Math.round(note)));
}

export function clampVelocity(velocity: number): number {
  return Math.min(127, Math.max(1, Math.round(velocity)));
}

export function midiNoteLabel(note: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(note / 12) - 1;
  return `${names[note % 12]}${octave}`;
}

export function createCapturedNote(
  note: number,
  velocity: number,
  startBeat: number,
  lengthBeats = DEFAULT_NOTE_LENGTH_BEATS,
): DAWNote {
  return {
    note: clampNoteNumber(note),
    velocity: clampVelocity(velocity),
    startBeat: quantizeBeat(startBeat),
    lengthBeats,
  };
}
