export const DEFAULT_CYCLE_START_BEAT = 0;
export const DEFAULT_CYCLE_END_BEAT = 4;
export const MIN_CYCLE_LENGTH_BEATS = 1;
export const LINEAR_PLAYBACK_LENGTH_BEATS = 4096;

function finiteBeat(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}

export function normalizeCycleRange(
  startBeat: number,
  endBeat: number,
): {startBeat: number; endBeat: number} {
  const start = finiteBeat(startBeat, DEFAULT_CYCLE_START_BEAT);
  const end = finiteBeat(endBeat, DEFAULT_CYCLE_END_BEAT);
  if (end - start >= MIN_CYCLE_LENGTH_BEATS) {
    return {startBeat: start, endBeat: end};
  }

  if (start <= end) {
    return {startBeat: start, endBeat: start + MIN_CYCLE_LENGTH_BEATS};
  }

  return {
    startBeat: Math.max(0, end - MIN_CYCLE_LENGTH_BEATS),
    endBeat: Math.max(MIN_CYCLE_LENGTH_BEATS, end),
  };
}
