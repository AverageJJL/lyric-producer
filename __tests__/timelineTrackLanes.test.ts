import type {DAWBlock} from '../src/store/useDAWStore';
import {
  buildTimelineTrackLaneLayout,
  timelineTrackHeight,
  trackIndexAtY,
} from '../src/ui/timelineTrackLanes';
import {createBlockPointerHandlers} from '../src/ui/timelineBlockPointerDrag';
import {ROW_HEIGHT, RULER_HEIGHT, TRACK_SIDEBAR_FOOTER_HEIGHT} from '../src/ui/timelineLayout';

const block: DAWBlock = {
  id: 'clip-1',
  trackId: 't1',
  name: 'MIDI',
  startBeat: 0,
  lengthBeats: 4,
  type: 'midi',
  color: '#336699',
  notes: [],
};

describe('timeline track lanes', () => {
  it('builds lane offsets from per-track height scales', () => {
    const layout = buildTimelineTrackLaneLayout([
      {id: 't1', trackHeightScale: 1.5},
      {id: 't2', trackHeightScale: 1.25},
    ]);

    const tallHeight = Math.round(ROW_HEIGHT * 1.5);
    const mediumHeight = Math.round(ROW_HEIGHT * 1.25);
    expect(timelineTrackHeight({trackHeightScale: 1.5})).toBe(tallHeight);
    expect(layout).toMatchObject({
      rowAreaHeight: tallHeight + mediumHeight,
      contentHeight: RULER_HEIGHT + tallHeight + mediumHeight + TRACK_SIDEBAR_FOOTER_HEIGHT,
      maxTrackRows: 2,
      lanes: [
        {trackId: 't1', index: 0, offsetTop: 0, height: tallHeight},
        {trackId: 't2', index: 1, offsetTop: tallHeight, height: mediumHeight},
      ],
    });
  });

  it('maps marquee y positions into variable-height rows', () => {
    const layout = buildTimelineTrackLaneLayout([
      {id: 't1', trackHeightScale: 1.5},
      {id: 't2', trackHeightScale: 1.25},
    ]);

    const firstHeight = timelineTrackHeight({trackHeightScale: 1.5});
    expect(trackIndexAtY(layout, firstHeight - 1)).toBe(0);
    expect(trackIndexAtY(layout, firstHeight)).toBe(1);
    expect(trackIndexAtY(layout, 999)).toBe(1);
  });

  it('uses variable lane heights for clip drag target rows', () => {
    const moved: Array<{startBeat: number; trackId: string}> = [];
    const layout = buildTimelineTrackLaneLayout([
      {id: 't1', trackHeightScale: 1.5},
      {id: 't2', trackHeightScale: 1.25},
    ]);
    const handlers = createBlockPointerHandlers({
      block,
      blocks: [block],
      trackCount: 2,
      trackIds: ['t1', 't2'],
      maxTimelineBeat: 64,
      rowHeight: ROW_HEIGHT,
      trackLaneLayout: layout,
      metrics: {left: {setValue: jest.fn()}, width: {setValue: jest.fn()}},
      dragStartXRef: {current: 0},
      dragStartBeatRef: {current: 0},
      dragStartLengthRef: {current: 4},
      dragStartTrackIndexRef: {current: 0},
      isDraggingRef: {current: false},
      sessionRef: {current: null},
      onSelectBlock: jest.fn(),
      onDraggingChange: jest.fn(),
      onMoveBlock: (_blockId, startBeat, trackId) => moved.push({startBeat, trackId}),
      onResizeBlock: jest.fn(),
    });

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 0, pageY: timelineTrackHeight({trackHeightScale: 1.5})});

    expect(moved).toEqual([{startBeat: 0, trackId: 't2'}]);
  });
});
