export type SnapGrid =
  | 'off'
  | 'bar'
  | 'beat'
  | '1/8T'
  | '1/8S'
  | '1/8'
  | '1/16T'
  | '1/16S'
  | '1/16'
  | '1/32';

export const DEFAULT_SNAP_GRID: SnapGrid = 'beat';

export const SNAP_GRID_OPTIONS: Array<{value: SnapGrid; label: string}> = [
  {value: 'off', label: 'Off'},
  {value: 'bar', label: 'Bar'},
  {value: 'beat', label: 'Beat'},
  {value: '1/8T', label: '1/8T'},
  {value: '1/8S', label: '1/8 Swing'},
  {value: '1/8', label: '1/8'},
  {value: '1/16T', label: '1/16T'},
  {value: '1/16S', label: '1/16 Swing'},
  {value: '1/16', label: '1/16'},
  {value: '1/32', label: '1/32'},
];

export function normalizeSnapGrid(value: unknown): SnapGrid {
  return SNAP_GRID_OPTIONS.some(option => option.value === value)
    ? value as SnapGrid
    : DEFAULT_SNAP_GRID;
}

export function snapGridStepBeats(
  snapGrid: SnapGrid,
  beatsPerBar = 4,
): number | null {
  const safeBeatsPerBar = Number.isFinite(beatsPerBar) && beatsPerBar > 0
    ? beatsPerBar
    : 4;
  switch (snapGrid) {
    case 'off':
      return null;
    case 'bar':
      return safeBeatsPerBar;
    case 'beat':
      return 1;
    case '1/8T':
      return 1 / 3;
    case '1/8S':
      return 0.5;
    case '1/8':
      return 0.5;
    case '1/16T':
      return 1 / 6;
    case '1/16S':
      return 0.25;
    case '1/16':
      return 0.25;
    case '1/32':
      return 0.125;
    default:
      return 1;
  }
}

function swingConfig(snapGrid: SnapGrid): {cycleBeats: number; swingBeat: number; minLength: number} | null {
  if (snapGrid === '1/8S') {
    return {cycleBeats: 1, swingBeat: 2 / 3, minLength: 1 / 3};
  }
  if (snapGrid === '1/16S') {
    return {cycleBeats: 0.5, swingBeat: 1 / 3, minLength: 1 / 6};
  }
  return null;
}

function snapBeatToSwingGrid(beat: number, snapGrid: SnapGrid): number | null {
  const config = swingConfig(snapGrid);
  if (!config) {
    return null;
  }

  const cycleStart = Math.floor(beat / config.cycleBeats) * config.cycleBeats;
  const candidates = [
    cycleStart,
    cycleStart + config.swingBeat,
    cycleStart + config.cycleBeats,
  ];
  return candidates.reduce((closest, candidate) =>
    Math.abs(candidate - beat) < Math.abs(closest - beat) ? candidate : closest,
  );
}

export function snapBeatToGrid(
  beat: number,
  snapGrid: SnapGrid,
  beatsPerBar = 4,
): number {
  const swungBeat = snapBeatToSwingGrid(beat, snapGrid);
  if (swungBeat !== null) {
    return swungBeat;
  }

  const step = snapGridStepBeats(snapGrid, beatsPerBar);
  if (!step) {
    return beat;
  }
  return Math.round(beat / step) * step;
}

export function snapLengthToGrid(
  lengthBeats: number,
  snapGrid: SnapGrid,
  beatsPerBar = 4,
): number {
  const swing = swingConfig(snapGrid);
  if (swing) {
    const swungLength = snapBeatToSwingGrid(Math.max(0, lengthBeats), snapGrid);
    return Math.max(swing.minLength, swungLength ?? swing.minLength);
  }

  const step = snapGridStepBeats(snapGrid, beatsPerBar);
  if (!step) {
    return Math.max(1, lengthBeats);
  }
  return Math.max(step, Math.round(lengthBeats / step) * step);
}

export function displayGridStepBeats(
  snapGrid: SnapGrid,
  beatsPerBar = 4,
): number {
  return snapGridStepBeats(snapGrid, beatsPerBar) ?? 1;
}
