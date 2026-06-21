import {
  clientXToBeat,
  createPlayheadScrubHandlers,
  snapPlayheadBeatToBar,
  type PlayheadScrubSession,
} from '../src/ui/playheadScrubPointer';
import {DEFAULT_TIMELINE_BEATS, PIXELS_PER_BEAT} from '../src/ui/timelineLayout';

describe('clientXToBeat', () => {
  it('maps clientX at timeline origin to beat 0', () => {
    expect(clientXToBeat(400, 400)).toBe(0);
  });

  it('maps clientX using the live visual origin without scroll compensation', () => {
    const timelineClientX = 200;
    const clientX = timelineClientX + 2 * PIXELS_PER_BEAT;

    expect(clientXToBeat(clientX, timelineClientX)).toBe(2);
  });

  it('clamps to timeline bounds', () => {
    expect(clientXToBeat(0, 100)).toBe(0);
    expect(clientXToBeat(100_000, 0)).toBe(DEFAULT_TIMELINE_BEATS);
  });

  it('uses the live timeline extent when it grows beyond the default width', () => {
    expect(clientXToBeat(100_000, 0, 144)).toBe(144);
  });

  it('uses the active timeline zoom scale', () => {
    expect(clientXToBeat(192, 0, 64, 96)).toBe(2);
  });
});

describe('snapPlayheadBeatToBar', () => {
  it('snaps to a bar start inside the visual magnet radius', () => {
    expect(snapPlayheadBeatToBar(3.9, 4, PIXELS_PER_BEAT)).toBe(4);
    expect(snapPlayheadBeatToBar(4.1, 4, PIXELS_PER_BEAT)).toBe(4);
  });

  it('keeps fractional positions outside the visual magnet radius', () => {
    expect(snapPlayheadBeatToBar(3.75, 4, PIXELS_PER_BEAT)).toBe(3.75);
  });

  it('uses the active bar length', () => {
    expect(snapPlayheadBeatToBar(2.9, 3, PIXELS_PER_BEAT)).toBe(3);
  });
});

describe('createPlayheadScrubHandlers', () => {
  it('preserves grab offset and syncs transport only on release', () => {
    const timelineClientX = 100;
    const playheadBeat = 4;
    const playheadClientX = timelineClientX + playheadBeat * PIXELS_PER_BEAT;
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const scrubbed: Array<{beat: number; syncTransport: boolean}> = [];
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => timelineClientX,
      getPlayheadBeat: () => playheadBeat,
      getMaxTimelineBeat: () => 128,
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat: (beat, options) => scrubbed.push({beat, syncTransport: options.syncTransport}),
    });

    handlers.onPointerDown({button: 0, pointerId: 7, clientX: playheadClientX + 10});
    handlers.onPointerMove({pointerId: 7, clientX: playheadClientX + 10 + 2 * PIXELS_PER_BEAT});
    handlers.onPointerUp({pointerId: 7, clientX: playheadClientX + 10 + 3 * PIXELS_PER_BEAT});

    expect(scrubbed).toEqual([
      {beat: 4, syncTransport: false},
      {beat: 6, syncTransport: false},
      {beat: 7, syncTransport: true},
    ]);
    expect(sessionRef.current).toBeNull();
  });

  it('ignores pointer moves from a different pointer id', () => {
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const onScrubBeat = jest.fn();
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => 0,
      getPlayheadBeat: () => 1,
      getMaxTimelineBeat: () => 128,
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat,
    });

    handlers.onPointerDown({button: 0, pointerId: 1, clientX: PIXELS_PER_BEAT});
    handlers.onPointerMove({pointerId: 2, clientX: 6 * PIXELS_PER_BEAT});

    expect(onScrubBeat).toHaveBeenCalledTimes(1);
    expect(sessionRef.current?.pointerId).toBe(1);
  });

  it('can scrub past the original 64-beat minimum when the timeline is longer', () => {
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const scrubbed: number[] = [];
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => 0,
      getPlayheadBeat: () => 0,
      getMaxTimelineBeat: () => 144,
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat: beat => scrubbed.push(beat),
    });

    handlers.onPointerDown({button: 0, pointerId: 1, clientX: 0});
    handlers.onPointerMove({pointerId: 1, clientX: 120 * PIXELS_PER_BEAT});
    handlers.onPointerUp({pointerId: 1, clientX: 140 * PIXELS_PER_BEAT});

    expect(scrubbed).toEqual([0, 120, 140]);
  });

  it('keeps scrubbed playhead positions continuous instead of snapping to beats', () => {
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const scrubbed: number[] = [];
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => 0,
      getPlayheadBeat: () => 0,
      getMaxTimelineBeat: () => 128,
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat: beat => scrubbed.push(beat),
    });

    handlers.onPointerDown({button: 0, pointerId: 1, clientX: 0});
    handlers.onPointerMove({pointerId: 1, clientX: 2.37 * PIXELS_PER_BEAT});
    handlers.onPointerUp({pointerId: 1, clientX: 2.62 * PIXELS_PER_BEAT});

    expect(scrubbed[0]).toBe(0);
    expect(scrubbed[1]).toBeCloseTo(2.37);
    expect(scrubbed[2]).toBeCloseTo(2.62);
  });

  it('snaps scrubbed playhead positions to nearby bar starts', () => {
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const scrubbed: number[] = [];
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => 0,
      getPlayheadBeat: () => 0,
      getMaxTimelineBeat: () => 128,
      pixelsPerBeat: PIXELS_PER_BEAT,
      barSnap: {beatsPerBar: 4},
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat: beat => scrubbed.push(beat),
    });

    handlers.onPointerDown({button: 0, pointerId: 1, clientX: 0});
    handlers.onPointerMove({pointerId: 1, clientX: 3.9 * PIXELS_PER_BEAT});
    handlers.onPointerUp({pointerId: 1, clientX: 4.1 * PIXELS_PER_BEAT});

    expect(scrubbed).toEqual([0, 4, 4]);
  });

  it('keeps scrubbed playhead positions continuous between bar magnets', () => {
    const sessionRef: {current: PlayheadScrubSession | null} = {current: null};
    const scrubbed: number[] = [];
    const handlers = createPlayheadScrubHandlers({
      getTimelineClientX: () => 0,
      getPlayheadBeat: () => 0,
      getMaxTimelineBeat: () => 128,
      pixelsPerBeat: PIXELS_PER_BEAT,
      barSnap: {beatsPerBar: 4},
      sessionRef,
      onScrubStart: jest.fn(),
      onScrubEnd: jest.fn(),
      onScrubBeat: beat => scrubbed.push(beat),
    });

    handlers.onPointerDown({button: 0, pointerId: 1, clientX: 0});
    handlers.onPointerMove({pointerId: 1, clientX: 2.37 * PIXELS_PER_BEAT});
    handlers.onPointerUp({pointerId: 1, clientX: 2.62 * PIXELS_PER_BEAT});

    expect(scrubbed[0]).toBe(0);
    expect(scrubbed[1]).toBeCloseTo(2.37);
    expect(scrubbed[2]).toBeCloseTo(2.62);
  });
});
