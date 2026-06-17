import {computeVisibleTimelineBeats, TIMELINE_EXTENT_BUFFER_BEATS} from '../src/ui/timelineExtent';
import type {DAWBlock} from '../src/store/useDAWStore';

function midiBlock(id: string, startBeat: number, lengthBeats: number): DAWBlock {
  return {
    id,
    trackId: 't1',
    type: 'midi',
    startBeat,
    lengthBeats,
    name: id,
    color: '#000',
    notes: [],
  };
}

describe('computeVisibleTimelineBeats', () => {
  it('keeps the default minimum when content is short', () => {
    expect(
      computeVisibleTimelineBeats({
        blocks: [midiBlock('a', 0, 4)],
        playheadBeat: 0,
      }),
    ).toBe(64);
  });

  it('extends past 64 beats when a clip ends beyond the default', () => {
    const beats = computeVisibleTimelineBeats({
      blocks: [midiBlock('long', 0, 100)],
      playheadBeat: 0,
    });
    expect(beats).toBeGreaterThan(100);
    expect(beats).toBe(144);
    expect(beats).toBeGreaterThanOrEqual(100 + TIMELINE_EXTENT_BUFFER_BEATS);
  });

  it('grows with playhead when recording ahead of clips', () => {
    const beats = computeVisibleTimelineBeats({
      blocks: [],
      playheadBeat: 96,
    });
    expect(beats).toBeGreaterThanOrEqual(96 + TIMELINE_EXTENT_BUFFER_BEATS);
  });
});
