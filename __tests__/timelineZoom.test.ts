import {
  MAX_TIMELINE_PIXELS_PER_BEAT,
  MIN_TIMELINE_PIXELS_PER_BEAT,
  clampTimelinePixelsPerBeat,
  fitTimelinePixelsPerBeat,
  fitSelectedTimelineBlocks,
  zoomTimelinePixelsPerBeat,
} from '../src/ui/timelineZoom';

describe('timeline zoom helpers', () => {
  it('clamps pixels per beat to timeline zoom bounds', () => {
    expect(clampTimelinePixelsPerBeat(1)).toBe(MIN_TIMELINE_PIXELS_PER_BEAT);
    expect(clampTimelinePixelsPerBeat(999)).toBe(MAX_TIMELINE_PIXELS_PER_BEAT);
  });

  it('zooms in and out in deterministic steps', () => {
    expect(zoomTimelinePixelsPerBeat(48, 'in')).toBe(60);
    expect(zoomTimelinePixelsPerBeat(48, 'out')).toBe(36);
  });

  it('fits the project width to the available viewport', () => {
    expect(fitTimelinePixelsPerBeat(64, 2048)).toBe(32);
    expect(fitTimelinePixelsPerBeat(64, 80)).toBe(MIN_TIMELINE_PIXELS_PER_BEAT);
  });

  it('fits the selected clip range and returns the scroll origin', () => {
    const fit = fitSelectedTimelineBlocks(
      [
        {id: 'a', trackId: 't1', name: 'A', startBeat: 8, lengthBeats: 2, type: 'midi', color: '#fff', notes: []},
        {id: 'b', trackId: 't1', name: 'B', startBeat: 12, lengthBeats: 4, type: 'midi', color: '#fff', notes: []},
      ],
      null,
      ['a', 'b'],
      960,
    );

    expect(fit).toEqual({pixelsPerBeat: 120, scrollLeft: 960});
  });
});
