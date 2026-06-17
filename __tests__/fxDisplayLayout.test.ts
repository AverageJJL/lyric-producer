import {
  compressorTransferPoints,
  freqToPlotX,
  gainToPlotY,
  plotXToFreq,
  plotYToGain,
} from '../src/music/fxDisplayLayout';

describe('fxDisplayLayout', () => {
  it('maps frequency log-linear across plot width', () => {
    expect(freqToPlotX(20, 200)).toBeCloseTo(0, 4);
    expect(freqToPlotX(20000, 200)).toBeCloseTo(200, 4);
    const roundTrip = plotXToFreq(freqToPlotX(440, 200), 200);
    expect(roundTrip).toBeCloseTo(440, 0);
  });

  it('maps gain linearly across plot height', () => {
    expect(gainToPlotY(0, 100)).toBeCloseTo(50, 4);
    expect(gainToPlotY(20, 100)).toBeCloseTo(0, 4);
    expect(plotYToGain(gainToPlotY(-6, 100), 100)).toBeCloseTo(-6, 1);
  });

  it('builds a knee in the compressor transfer curve', () => {
    const points = compressorTransferPoints(-18, 4);
    const below = points.find(point => point.inputDb === -24);
    const above = points.find(point => point.inputDb === -6);
    expect(below?.outputDb).toBe(-24);
    expect(above?.outputDb).toBeLessThan(-6);
    expect(above?.outputDb).toBeGreaterThan(-18);
  });
});
