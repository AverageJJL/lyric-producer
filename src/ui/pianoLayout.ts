/** Shared piano keyboard geometry — single slot width for white keys and black-key placement. */
export const WHITE_KEY_WIDTH = 42;
export const WHITE_KEY_GAP = 2;
export const WHITE_KEY_SLOT = WHITE_KEY_WIDTH + WHITE_KEY_GAP;
export const BLACK_KEY_WIDTH = 28;
export const WHITE_KEY_HEIGHT = 120;
export const BLACK_KEY_HEIGHT = 78;

/** Semitone offsets of black keys within one octave (C = 0). */
export const BLACK_KEY_SEMITONES = [1, 3, 6, 8, 10] as const;

/** White-key index (0–6) for each black-key semitone in an octave. */
const BLACK_KEY_WHITE_INDEX: Record<number, number> = {
  1: 0,
  3: 1,
  6: 3,
  8: 4,
  10: 5,
};

export const OCTAVE_WHITE_NOTES = [0, 2, 4, 5, 7, 9, 11] as const;

/** Left edge (px) for a black key centered between its surrounding white keys. */
export function blackKeyLeftInOctave(semitone: number): number {
  const whiteIndex = BLACK_KEY_WHITE_INDEX[semitone] ?? 0;
  const centerBetweenWhites =
    whiteIndex * WHITE_KEY_SLOT + WHITE_KEY_SLOT + WHITE_KEY_GAP / 2;
  return centerBetweenWhites - BLACK_KEY_WIDTH / 2;
}

export function octaveContainerWidth(): number {
  return OCTAVE_WHITE_NOTES.length * WHITE_KEY_SLOT;
}
