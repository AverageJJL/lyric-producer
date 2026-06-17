import {
  beatsPerBarForTimeSignature,
  type TimeSignature,
} from '../store/projectMetadata';

export type ProjectPerformanceMode = 'linear' | 'looper';
export type LooperLengthBars = 4 | 8;

export const DEFAULT_PERFORMANCE_MODE: ProjectPerformanceMode = 'linear';
export const DEFAULT_LOOPER_LENGTH_BARS: LooperLengthBars = 4;
export const LOOPER_LENGTH_OPTIONS: LooperLengthBars[] = [4, 8];

export type ProjectPerformanceContext = {
  mode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
  looperLengthBeats: number;
  circular: boolean;
  rules: string[];
};

export function normalizePerformanceMode(value: unknown): ProjectPerformanceMode {
  return value === 'looper' ? 'looper' : DEFAULT_PERFORMANCE_MODE;
}

export function normalizeLooperLengthBars(value: unknown): LooperLengthBars {
  return value === 8 ? 8 : DEFAULT_LOOPER_LENGTH_BARS;
}

export function looperLengthBeats(
  bars: LooperLengthBars,
  timeSignature?: TimeSignature,
): number {
  return Number((bars * beatsPerBarForTimeSignature(timeSignature)).toFixed(6));
}

export function projectPerformanceContext(input: {
  performanceMode?: ProjectPerformanceMode;
  looperLengthBars?: LooperLengthBars;
  timeSignature?: TimeSignature;
}): ProjectPerformanceContext {
  const mode = normalizePerformanceMode(input.performanceMode);
  const bars = normalizeLooperLengthBars(input.looperLengthBars);
  const lengthBeats = looperLengthBeats(bars, input.timeSignature);
  return {
    mode,
    looperLengthBars: bars,
    looperLengthBeats: lengthBeats,
    circular: mode === 'looper',
    rules: mode === 'looper'
      ? [
          'Treat the timeline as a circular looper container.',
          `Keep generated notes inside ${lengthBeats} beats unless explicitly asked to spill over.`,
          'Prefer overdub-friendly phrases that wrap cleanly at the loop boundary.',
        ]
      : ['Treat the timeline as a linear arrangement.'],
  };
}
