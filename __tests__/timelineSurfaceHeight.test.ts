import {timelineSurfaceHeight} from '../src/ui/timelineSurfaceHeight';

describe('timelineSurfaceHeight', () => {
  it('fills the visible arrange viewport when tracks are shorter', () => {
    expect(timelineSurfaceHeight(180, 720)).toBe(720);
  });

  it('keeps the full track content height when tracks need scrolling', () => {
    expect(timelineSurfaceHeight(1280, 720)).toBe(1280);
  });
});
