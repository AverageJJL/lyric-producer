/** Silence gate — peaks below this are treated as no signal (avoids noise-floor flicker). */
export const PEAK_SILENCE_GATE = 0.02;

export type WaveformBar = {
  key: string;
  heightRatio: number;
};

/** Turn raw C++ peaks into stable bar heights for the clip UI. */
export function buildWaveformBars(
  peaks: number[],
  hasAudioFile: boolean,
  barCount = 64,
): {bars: WaveformBar[]; hasAudibleWaveform: boolean} {
  if (peaks.length === 0) {
    const flat = hasAudioFile ? 0.1 : 0.06;
    return {
      hasAudibleWaveform: false,
      bars: Array.from({length: barCount}, (_, index) => ({
        key: `flat-${index}`,
        heightRatio: flat,
      })),
    };
  }

  const gated = peaks.map(peak => (peak < PEAK_SILENCE_GATE ? 0 : peak));
  const maxPeak = gated.reduce((max, peak) => Math.max(max, peak), 0);

  if (maxPeak <= 0) {
    const flat = hasAudioFile ? 0.1 : 0.06;
    return {
      hasAudibleWaveform: false,
      bars: Array.from({length: barCount}, (_, index) => ({
        key: `silent-${index}`,
        heightRatio: flat,
      })),
    };
  }

  return {
    hasAudibleWaveform: true,
    bars: gated.map((peak, index) => ({
      key: `peak-${index}`,
      heightRatio: Math.max(0.08, Math.min(1, peak / maxPeak)),
    })),
  };
}

export function hasAudibleWaveformPeaks(peaks: number[] | undefined): boolean {
  if (!peaks || peaks.length === 0) {
    return false;
  }
  return peaks.some(peak => peak >= PEAK_SILENCE_GATE);
}
