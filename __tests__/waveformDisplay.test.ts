import {buildWaveformBars, hasAudibleWaveformPeaks} from '../src/music/waveformDisplay';

describe('waveformDisplay', () => {
  it('treats sub-gate peaks as silent with uniform bars', () => {
    const {bars, hasAudibleWaveform} = buildWaveformBars([0.01, 0.005, 0.008], true);
    expect(hasAudibleWaveform).toBe(false);
    expect(bars.every(bar => bar.heightRatio === 0.1)).toBe(true);
  });

  it('normalizes audible peaks to the tallest bar', () => {
    const {bars, hasAudibleWaveform} = buildWaveformBars([0.1, 0.5, 0.25], true);
    expect(hasAudibleWaveform).toBe(true);
    expect(Math.max(...bars.map(bar => bar.heightRatio))).toBe(1);
  });

  it('detects audible peaks above the silence gate', () => {
    expect(hasAudibleWaveformPeaks([0, 0.01, 0])).toBe(false);
    expect(hasAudibleWaveformPeaks([0, 0.05, 0])).toBe(true);
  });
});
