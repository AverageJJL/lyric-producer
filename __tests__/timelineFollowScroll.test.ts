import {nextTimelineScrollLeft} from '../src/ui/timelineFollowScroll';

describe('nextTimelineScrollLeft', () => {
  it('scrolls right when playhead nears the right edge', () => {
    const next = nextTimelineScrollLeft({
      scrollLeft: 0,
      viewportWidth: 800,
      playheadPx: 750,
      marginPx: 120,
    });
    expect(next).toBe(70);
  });

  it('scrolls left when playhead is before the visible window', () => {
    const next = nextTimelineScrollLeft({
      scrollLeft: 500,
      viewportWidth: 800,
      playheadPx: 100,
      marginPx: 120,
    });
    expect(next).toBe(0);
  });

  it('returns null when playhead is comfortably in view', () => {
    const next = nextTimelineScrollLeft({
      scrollLeft: 0,
      viewportWidth: 800,
      playheadPx: 400,
      marginPx: 120,
    });
    expect(next).toBeNull();
  });
});
