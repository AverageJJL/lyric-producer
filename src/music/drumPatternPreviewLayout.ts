import {DRUM_SAMPLE_KEYS} from '../assets/drumKit';
import type {DrumPattern} from './drumPatterns';
import {barCountForLength, BEATS_PER_BAR, BEATS_PER_STEP} from './drumPatterns';
import {PIXELS_PER_BEAT} from '../ui/timelineLayout';

export type DrumPreviewDotLayout = {
  key: string;
  looped: boolean;
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Beat-locked drum step positions — container resize repeats bars instead of stretching hits.
 */
export type DrumPatternPreviewOptions = {
  /** Beats at/after this offset render dimmed (loop extension preview while dragging). */
  dimmedFromBeat?: number;
};

export function drumPatternDotsLayout(
  pattern: DrumPattern,
  lengthBeats: number,
  heightPx: number,
  pixelsPerBeat: number = PIXELS_PER_BEAT,
  options?: DrumPatternPreviewOptions,
): DrumPreviewDotLayout[] {
  const dimmedFromBeat = options?.dimmedFromBeat;
  const barCount = barCountForLength(lengthBeats);
  const stepWidth = pixelsPerBeat * BEATS_PER_STEP;
  const rowHeight = Math.max(2, heightPx / DRUM_SAMPLE_KEYS.length - 1);

  return Array.from({length: barCount}).flatMap((_, bar) =>
    DRUM_SAMPLE_KEYS.flatMap((sampleKey, rowIndex) =>
      pattern.steps[sampleKey]
        .map((active, step) => {
          const stepOffsetBeats = bar * BEATS_PER_BAR + step * BEATS_PER_STEP;
          if (!active || stepOffsetBeats >= lengthBeats - 1e-6) {
            return null;
          }
          const looped =
            bar > 0 ||
            (dimmedFromBeat !== undefined && stepOffsetBeats >= dimmedFromBeat - 1e-6);
          return {
            key: `${bar}-${sampleKey}-${step}`,
            looped,
            left: bar * BEATS_PER_BAR * pixelsPerBeat + step * stepWidth,
            top: rowIndex * (rowHeight + 1) + 1,
            width: Math.max(2, stepWidth - 1),
            height: Math.max(2, rowHeight - 1),
          };
        })
        .filter((dot): dot is DrumPreviewDotLayout => dot !== null),
    ),
  );
}
