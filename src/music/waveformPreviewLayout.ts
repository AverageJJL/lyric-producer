import {PEAK_SILENCE_GATE} from './waveformDisplay';
import {PIXELS_PER_BEAT} from '../ui/timelineLayout';

/** Fixed horizontal spacing for live recording — avoids re-stretch jitter as the clip grows. */
export const LIVE_WAVEFORM_PIXELS_PER_PEAK = 2;

export type WaveformPreviewLayoutOptions = {
  /** Map each peak to a fixed X step; new peaks append at the right edge only. */
  liveRecording?: boolean;
  /** Visual-only source preview reversal; native playback still owns real audio reversal. */
  isReversed?: boolean;
  fadeInBeats?: number;
  fadeOutBeats?: number;
  clipGainDb?: number;
};

export type WaveformFadeOverlay = {
  edge: 'in' | 'out';
  startPx: number;
  endPx: number;
  widthPx: number;
  curveD: string;
  maskD: string;
};

export type WaveformPreviewLayout = {
  /** Closed SVG path for filled bipolar envelope. */
  pathD: string;
  hasAudibleWaveform: boolean;
  sourceWidthPx: number;
  offsetPx: number;
  visibleWidthPx: number;
  centerY: number;
  stripHeightPx: number;
  fadeOverlays: WaveformFadeOverlay[];
};

/** Max-pool downsample peaks to a target count (preserves timeline order). */
export function resamplePeaksMaxPool(peaks: number[], targetCount: number): number[] {
  if (targetCount <= 0 || peaks.length === 0) {
    return [];
  }
  if (peaks.length <= targetCount) {
    return peaks.map(p => Math.min(1, Math.max(0, p)));
  }
  const out: number[] = [];
  const ratio = peaks.length / targetCount;
  for (let i = 0; i < targetCount; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.max(start + 1, Math.floor((i + 1) * ratio));
    let max = 0;
    for (let j = start; j < end; j++) {
      max = Math.max(max, peaks[j] ?? 0);
    }
    out.push(max);
  }
  return out;
}

function normalizePeakHeights(peaks: number[], hasAudioFile: boolean): number[] {
  if (peaks.length === 0) {
    return [];
  }
  let maxPeak = 0;
  for (let index = 0; index < peaks.length; index += 1) {
    maxPeak = Math.max(
      maxPeak,
      peaks[index]! < PEAK_SILENCE_GATE ? 0 : peaks[index]!,
    );
  }
  if (maxPeak <= 0) {
    const flat = hasAudioFile ? 0.1 : 0.06;
    return Array.from({length: peaks.length}, () => flat);
  }
  const heights: number[] = [];
  for (let index = 0; index < peaks.length; index += 1) {
    const peak = peaks[index]!;
    heights.push(
      peak < PEAK_SILENCE_GATE ? 0 : Math.max(0.08, Math.min(1, peak / maxPeak)),
    );
  }
  return heights;
}

function previewPeaks(peaks: number[], isReversed?: boolean): number[] {
  const clamped = peaks.map(p => Math.min(1, Math.max(0, p)));
  return isReversed ? clamped.reverse() : clamped;
}

function applyVisualGain(heightRatios: number[], gainDb: number | undefined): number[] {
  if (typeof gainDb !== 'number' || !Number.isFinite(gainDb) || Math.abs(gainDb) < 0.001) {
    return heightRatios;
  }
  const linearGain = Math.pow(10, gainDb / 20);
  return heightRatios.map(height => Math.max(0, Math.min(1, height * linearGain)));
}

/** Build closed path: top envelope L→R, bottom envelope R→L. X in source-local pixels. */
export function buildBipolarEnvelopePath(
  heightRatios: number[],
  envelopeWidthPx: number,
  centerY: number,
  drawableHeight: number,
): string {
  const count = heightRatios.length;
  if (count === 0 || envelopeWidthPx <= 0) {
    return '';
  }

  const halfAmp = drawableHeight / 2;
  const xAt = (index: number) =>
    envelopeWidthPx * (count === 1 ? 0.5 : (index + 0.5) / count);

  let d = `M ${xAt(0).toFixed(2)} ${(centerY - heightRatios[0]! * halfAmp).toFixed(2)}`;
  for (let i = 1; i < count; i++) {
    d += ` L ${xAt(i).toFixed(2)} ${(centerY - heightRatios[i]! * halfAmp).toFixed(2)}`;
  }
  for (let i = count - 1; i >= 0; i--) {
    d += ` L ${xAt(i).toFixed(2)} ${(centerY + heightRatios[i]! * halfAmp).toFixed(2)}`;
  }
  return `${d} Z`;
}

function clampFadeWidth(
  fadeBeats: number | undefined,
  visibleLengthBeats: number,
  pixelsPerBeat: number,
): number {
  if (typeof fadeBeats !== 'number' || !Number.isFinite(fadeBeats) || fadeBeats <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(visibleLengthBeats, fadeBeats) * pixelsPerBeat);
}

function fadeOverlay(
  edge: 'in' | 'out',
  startPx: number,
  widthPx: number,
  stripHeightPx: number,
  centerY: number,
): WaveformFadeOverlay | null {
  if (widthPx <= 0) {
    return null;
  }

  const topY = 2;
  const endPx = startPx + widthPx;
  const controlInset = widthPx * 0.62;
  const curveD =
    edge === 'in'
      ? `M ${startPx.toFixed(2)} ${centerY.toFixed(2)} Q ${(startPx + controlInset).toFixed(2)} ${centerY.toFixed(2)} ${endPx.toFixed(2)} ${topY.toFixed(2)}`
      : `M ${startPx.toFixed(2)} ${topY.toFixed(2)} Q ${(endPx - controlInset).toFixed(2)} ${topY.toFixed(2)} ${endPx.toFixed(2)} ${centerY.toFixed(2)}`;
  const maskD =
    edge === 'in'
      ? `M ${startPx.toFixed(2)} 0 L ${endPx.toFixed(2)} 0 L ${startPx.toFixed(2)} ${stripHeightPx.toFixed(2)} Z`
      : `M ${startPx.toFixed(2)} 0 L ${endPx.toFixed(2)} 0 L ${endPx.toFixed(2)} ${stripHeightPx.toFixed(2)} Z`;

  return {edge, startPx, endPx, widthPx, curveD, maskD};
}

/** Live path: each peak index maps to a fixed pixel column (no width-based resampling). */
export function buildBipolarEnvelopePathFixedSpacing(
  heightRatios: number[],
  pixelsPerPeak: number,
  centerY: number,
  drawableHeight: number,
): string {
  const count = heightRatios.length;
  if (count === 0 || pixelsPerPeak <= 0) {
    return '';
  }

  const halfAmp = drawableHeight / 2;
  const xAt = (index: number) => (index + 0.5) * pixelsPerPeak;

  let d = `M ${xAt(0).toFixed(2)} ${(centerY - heightRatios[0]! * halfAmp).toFixed(2)}`;
  for (let i = 1; i < count; i++) {
    d += ` L ${xAt(i).toFixed(2)} ${(centerY - heightRatios[i]! * halfAmp).toFixed(2)}`;
  }
  for (let i = count - 1; i >= 0; i--) {
    d += ` L ${xAt(i).toFixed(2)} ${(centerY + heightRatios[i]! * halfAmp).toFixed(2)}`;
  }
  return `${d} Z`;
}

/** First M x coordinate in a path (for tests). */
export function firstPathVertexX(pathD: string): number | null {
  const match = pathD.match(/^M\s+([\d.]+)/);
  return match ? Number(match[1]) : null;
}

/**
 * Fixed-scale waveform inside a trim window — peaks map to absolute source X, not viewport scroll.
 */
export function waveformPreviewLayout(
  peaks: number[],
  hasAudioFile: boolean,
  visibleLengthBeats: number,
  visibleWidthPx: number,
  heightPx: number,
  sourceLengthBeats: number,
  sourceOffsetBeats = 0,
  pixelsPerBeat: number = PIXELS_PER_BEAT,
  envelopeWidthPx?: number,
  options?: WaveformPreviewLayoutOptions,
): WaveformPreviewLayout {
  const sourceWidthPx = Math.max(1, sourceLengthBeats * pixelsPerBeat);
  const offsetPx = Math.max(0, sourceOffsetBeats * pixelsPerBeat);
  const stripHeightPx = Math.max(2, heightPx);
  const centerY = stripHeightPx / 2;
  const drawableHeight = Math.max(2, stripHeightPx - 4);
  const fadeInWidthPx = clampFadeWidth(options?.fadeInBeats, visibleLengthBeats, pixelsPerBeat);
  const fadeOutWidthPx = clampFadeWidth(options?.fadeOutBeats, visibleLengthBeats, pixelsPerBeat);
  const visibleStartPx = offsetPx;
  const visibleEndPx = offsetPx + visibleWidthPx;
  const fadeOverlays = [
    fadeOverlay('in', visibleStartPx, fadeInWidthPx, stripHeightPx, centerY),
    fadeOverlay('out', visibleEndPx - fadeOutWidthPx, fadeOutWidthPx, stripHeightPx, centerY),
  ].filter((overlay): overlay is WaveformFadeOverlay => overlay !== null);

  if (options?.liveRecording && peaks.length > 0) {
    const displayPeaks =
      peaks.length > 4096
        ? resamplePeaksMaxPool(previewPeaks(peaks, options.isReversed), 4096)
        : previewPeaks(peaks, options.isReversed);
    const heights = applyVisualGain(
      normalizePeakHeights(displayPeaks, hasAudioFile),
      options.clipGainDb,
    );
    const pathD = buildBipolarEnvelopePathFixedSpacing(
      heights,
      LIVE_WAVEFORM_PIXELS_PER_PEAK,
      centerY,
      drawableHeight,
    );
    return {
      pathD,
      hasAudibleWaveform: heights.some(h => h > 0.08),
      sourceWidthPx,
      offsetPx,
      visibleWidthPx,
      centerY,
      stripHeightPx,
      fadeOverlays,
    };
  }

  const spanPx = Math.max(1, Math.min(sourceWidthPx, envelopeWidthPx ?? sourceWidthPx));
  const targetPoints = Math.min(4096, Math.max(64, Math.ceil(spanPx)));
  const resampled = resamplePeaksMaxPool(previewPeaks(peaks, options?.isReversed), targetPoints);
  const heights = applyVisualGain(
    normalizePeakHeights(resampled, hasAudioFile),
    options?.clipGainDb,
  );
  const hasAudibleWaveform = heights.some(h => h > 0.08);
  const pathD = buildBipolarEnvelopePath(heights, spanPx, centerY, drawableHeight);

  return {
    pathD,
    hasAudibleWaveform,
    sourceWidthPx,
    offsetPx,
    visibleWidthPx,
    centerY,
    stripHeightPx,
    fadeOverlays,
  };
}
