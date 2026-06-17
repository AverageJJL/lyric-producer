/**
 * Display-only math for FX plugin UIs — no audio processing.
 */

const FX_EQ_FREQ_MIN = 20;
const FX_EQ_FREQ_MAX = 20000;
const FX_EQ_GAIN_MIN = -20;
const FX_EQ_GAIN_MAX = 20;
const FX_COMP_THRESHOLD_MIN = -40;
const FX_COMP_THRESHOLD_MAX = 0;
const FX_COMP_RATIO_MIN = 1;
const FX_COMP_RATIO_MAX = 20;

export type EqCurvePoint = {
  freq: number;
  gain: number;
};

export type FxPlotSize = {width: number; height: number};

const FREQ_LOG_MIN = Math.log10(FX_EQ_FREQ_MIN);
const FREQ_LOG_MAX = Math.log10(FX_EQ_FREQ_MAX);

export function freqToPlotX(freq: number, width: number): number {
  const clamped = Math.min(FX_EQ_FREQ_MAX, Math.max(FX_EQ_FREQ_MIN, freq));
  const t = (Math.log10(clamped) - FREQ_LOG_MIN) / (FREQ_LOG_MAX - FREQ_LOG_MIN);
  return t * width;
}

export function plotXToFreq(x: number, width: number): number {
  const t = Math.min(1, Math.max(0, x / width));
  const logFreq = FREQ_LOG_MIN + t * (FREQ_LOG_MAX - FREQ_LOG_MIN);
  return Math.pow(10, logFreq);
}

export function gainToPlotY(gainDb: number, height: number): number {
  const clamped = Math.min(FX_EQ_GAIN_MAX, Math.max(FX_EQ_GAIN_MIN, gainDb));
  const t = (FX_EQ_GAIN_MAX - clamped) / (FX_EQ_GAIN_MAX - FX_EQ_GAIN_MIN);
  return t * height;
}

export function plotYToGain(y: number, height: number): number {
  const t = Math.min(1, Math.max(0, y / height));
  return FX_EQ_GAIN_MAX - t * (FX_EQ_GAIN_MAX - FX_EQ_GAIN_MIN);
}

export function eqCurveToSvgPath(curve: EqCurvePoint[], size: FxPlotSize): string {
  if (curve.length === 0) {
    return '';
  }
  const points = curve.map(
    point => `${freqToPlotX(point.freq, size.width)},${gainToPlotY(point.gain, size.height)}`,
  );
  return `M ${points.join(' L ')}`;
}

export type CompressorPlotPoint = {inputDb: number; outputDb: number};

/** Static transfer curve for threshold + ratio (no live GR). */
export function compressorTransferPoints(
  threshold: number,
  ratio: number,
  inputMin = -48,
  inputMax = 0,
  steps = 32,
): CompressorPlotPoint[] {
  const safeRatio = Math.min(FX_COMP_RATIO_MAX, Math.max(FX_COMP_RATIO_MIN, ratio));
  const safeThreshold = Math.min(
    FX_COMP_THRESHOLD_MAX,
    Math.max(FX_COMP_THRESHOLD_MIN, threshold),
  );
  const points: CompressorPlotPoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const inputDb = inputMin + ((inputMax - inputMin) * i) / steps;
    const over = inputDb - safeThreshold;
    const outputDb = over > 0 ? safeThreshold + over / safeRatio : inputDb;
    points.push({inputDb, outputDb});
  }
  return points;
}

export function compressorTransferToSvgPath(
  threshold: number,
  ratio: number,
  size: FxPlotSize,
  inputMin = -48,
  inputMax = 0,
): string {
  const points = compressorTransferPoints(threshold, ratio, inputMin, inputMax);
  const xSpan = inputMax - inputMin;
  const ySpan = inputMax - inputMin;
  const toX = (db: number) => ((db - inputMin) / xSpan) * size.width;
  const toY = (db: number) => size.height - ((db - inputMin) / ySpan) * size.height;
  const segments = points.map(point => `${toX(point.inputDb)},${toY(point.outputDb)}`);
  return segments.length > 0 ? `M ${segments.join(' L ')}` : '';
}

export function formatHz(freq: number): string {
  if (freq >= 1000) {
    return `${(freq / 1000).toFixed(freq >= 10000 ? 0 : 1)}k`;
  }
  return `${Math.round(freq)}`;
}

export function formatDb(db: number): string {
  const rounded = Math.round(db * 10) / 10;
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}
