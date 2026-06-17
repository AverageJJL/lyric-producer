import {
  DEFAULT_SNAP_GRID,
  displayGridStepBeats,
  normalizeSnapGrid,
  snapBeatToGrid,
  snapGridStepBeats,
  snapLengthToGrid,
} from '../src/ui/snapGrid';

describe('snap grid', () => {
  it('normalizes unknown values to the default beat grid', () => {
    expect(normalizeSnapGrid('1/16')).toBe('1/16');
    expect(normalizeSnapGrid('1/8T')).toBe('1/8T');
    expect(normalizeSnapGrid('1/16S')).toBe('1/16S');
    expect(normalizeSnapGrid('unknown')).toBe(DEFAULT_SNAP_GRID);
  });

  it('maps musical grid labels to beat steps', () => {
    expect(snapGridStepBeats('bar', 3)).toBe(3);
    expect(snapGridStepBeats('bar', 0.5)).toBe(0.5);
    expect(snapGridStepBeats('beat')).toBe(1);
    expect(snapGridStepBeats('1/8T')).toBeCloseTo(1 / 3);
    expect(snapGridStepBeats('1/8S')).toBe(0.5);
    expect(snapGridStepBeats('1/8')).toBe(0.5);
    expect(snapGridStepBeats('1/16T')).toBeCloseTo(1 / 6);
    expect(snapGridStepBeats('1/16S')).toBe(0.25);
    expect(snapGridStepBeats('1/16')).toBe(0.25);
    expect(snapGridStepBeats('1/32')).toBe(0.125);
    expect(snapGridStepBeats('off')).toBeNull();
  });

  it('snaps beat positions and lengths while preserving snap off', () => {
    expect(snapBeatToGrid(2.37, '1/16')).toBe(2.25);
    expect(snapBeatToGrid(1.2, '1/8T')).toBeCloseTo(4 / 3);
    expect(snapBeatToGrid(1.58, '1/8S')).toBeCloseTo(5 / 3);
    expect(snapBeatToGrid(2.28, '1/16S')).toBeCloseTo(7 / 3);
    expect(snapBeatToGrid(2.37, 'off')).toBe(2.37);
    expect(snapLengthToGrid(0.27, '1/16T')).toBeCloseTo(1 / 3);
    expect(snapLengthToGrid(0.28, '1/16S')).toBeCloseTo(1 / 3);
    expect(snapLengthToGrid(0.1, '1/8S')).toBeCloseTo(1 / 3);
    expect(snapLengthToGrid(2.37, '1/8')).toBe(2.5);
    expect(displayGridStepBeats('1/8T')).toBeCloseTo(1 / 3);
    expect(displayGridStepBeats('1/16S')).toBe(0.25);
    expect(displayGridStepBeats('off')).toBe(1);
  });
});
