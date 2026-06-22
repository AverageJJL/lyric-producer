import {createDefaultDrumPatternBlock, isDrumPatternBlock} from '../src/music/clipFactories';
import {BEATS_PER_BAR} from '../src/music/drumPatterns';
import type {DAWBlock} from '../src/store/useDAWStore';
import {
  blockResizeVisualWidthPx,
  createBlockPointerHandlers,
  isMoveLeftEdgeBlock,
  resolveBlockDragMode,
  usesAudioTrimResize,
  usesOverlayClipShell,
} from '../src/ui/timelineBlockPointerDrag';
import {previewAudioSourceOffsetBeats} from '../src/ui/timelineClipPreview';
import {PIXELS_PER_BEAT, RESIZE_HANDLE_WIDTH} from '../src/ui/timelineLayout';

describe('resolveBlockDragMode', () => {
  const widthPx = 200;

  it('selects resize-left on the leading edge', () => {
    expect(resolveBlockDragMode(0, widthPx)).toBe('resize-left');
    expect(resolveBlockDragMode(RESIZE_HANDLE_WIDTH, widthPx)).toBe('resize-left');
  });

  it('selects resize-right on the trailing edge', () => {
    expect(resolveBlockDragMode(widthPx - 1, widthPx)).toBe('resize-right');
    expect(resolveBlockDragMode(widthPx - RESIZE_HANDLE_WIDTH, widthPx)).toBe('resize-right');
  });

  it('selects move in the middle', () => {
    expect(resolveBlockDragMode(RESIZE_HANDLE_WIDTH + 1, widthPx)).toBe('move');
    expect(resolveBlockDragMode(widthPx - RESIZE_HANDLE_WIDTH - 1, widthPx)).toBe('move');
  });
});

describe('block resize routing', () => {
  const midiBlock: DAWBlock = {
    id: 'midi-1',
    trackId: 't1',
    name: 'MIDI',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#336699',
    notes: [],
  };

  const drumBlock = createDefaultDrumPatternBlock('t1', 0, 0, 'pattern-1');

  const voiceBlock: DAWBlock = {
    id: 'voice-1',
    trackId: 't2',
    name: 'Voice',
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#996633',
    sourceLengthBeats: 8,
    sourceOffsetBeats: 0,
    audioFilePath: 'recordings/test.wav',
  };

  it('identifies drum pattern blocks', () => {
    expect(isDrumPatternBlock(drumBlock)).toBe(true);
  });

  it('routes only drum left edge to move', () => {
    expect(isMoveLeftEdgeBlock(midiBlock)).toBe(false);
    expect(isMoveLeftEdgeBlock(drumBlock)).toBe(true);
    expect(isMoveLeftEdgeBlock(voiceBlock)).toBe(false);
  });

  it('uses audio trim only for recorded voice clips, not drum loops', () => {
    expect(usesAudioTrimResize(voiceBlock)).toBe(true);
    expect(usesAudioTrimResize(drumBlock)).toBe(false);
    expect(usesAudioTrimResize(midiBlock)).toBe(false);
  });

  it('keeps waveform source offset stable while moving audio clips', () => {
    const trimmedVoice = {...voiceBlock, startBeat: 2, sourceOffsetBeats: 1.5};

    expect(previewAudioSourceOffsetBeats(trimmedVoice, 'move', 6)).toBe(1.5);
    expect(previewAudioSourceOffsetBeats(trimmedVoice, 'resize-right', 2)).toBe(1.5);
    expect(previewAudioSourceOffsetBeats(trimmedVoice, 'resize-left', 4)).toBe(3.5);
  });

  it('drum blocks start at one bar but are not capped to source trim on resize', () => {
    expect(drumBlock.lengthBeats).toBe(BEATS_PER_BAR);
    expect(drumBlock.sourceLengthBeats).toBe(BEATS_PER_BAR);
    expect(usesAudioTrimResize(drumBlock)).toBe(false);
  });
});

describe('blockResizeVisualWidthPx', () => {
  const midiBlock: DAWBlock = {
    id: 'midi-1',
    trackId: 't1',
    name: 'MIDI',
    startBeat: 0,
    lengthBeats: 4,
    type: 'midi',
    color: '#336699',
    notes: [],
  };

  const audioBlock: DAWBlock = {
    id: 'audio-1',
    trackId: 't1',
    name: 'Audio',
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#996633',
    audioFilePath: 'recordings/test.wav',
  };

  it('uses full beat width for MIDI during live resize', () => {
    expect(blockResizeVisualWidthPx(midiBlock, 8)).toBe(8 * PIXELS_PER_BEAT);
  });

  it('uses full beat width for drum pattern blocks', () => {
    const drumBlock = createDefaultDrumPatternBlock('t1', 0, 0, 'pattern-1');
    expect(blockResizeVisualWidthPx(drumBlock, 8)).toBe(8 * PIXELS_PER_BEAT);
  });

  it('uses full beat width for recorded voice/audio overlay clips', () => {
    expect(usesOverlayClipShell(audioBlock)).toBe(true);
    expect(blockResizeVisualWidthPx(audioBlock, 8)).toBe(8 * PIXELS_PER_BEAT);
  });
});

describe('timeline snap during pointer drag', () => {
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

  function buildHandlers(
    snapGrid: 'off' | '1/16',
    pixelsPerBeat = PIXELS_PER_BEAT,
    options?: {block?: DAWBlock; isRelativeSnapEnabled?: boolean},
  ) {
    const dragBlock = options?.block ?? block;
    const moved: Array<{startBeat: number; trackId: string}> = [];
    const handlers = createBlockPointerHandlers({
      block: dragBlock,
      blocks: [dragBlock],
      trackCount: 1,
      trackIds: ['t1'],
      maxTimelineBeat: 64,
      pixelsPerBeat,
      snapGrid,
      isRelativeSnapEnabled: options?.isRelativeSnapEnabled,
      beatsPerBar: 4,
      metrics: {
        left: {setValue: jest.fn()},
        width: {setValue: jest.fn()},
      },
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
    return {handlers, moved};
  }

  it('honors fractional snap grid for clip movement', () => {
    const {handlers, moved} = buildHandlers('1/16');

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 0.6 * PIXELS_PER_BEAT, pageY: 0});

    expect(moved).toEqual([{startBeat: 0.5, trackId: 't1'}]);
  });

  it('preserves off-grid clip offsets when relative snap is enabled', () => {
    const offGridBlock = {...block, startBeat: 1.1};
    const {handlers, moved} = buildHandlers('1/16', PIXELS_PER_BEAT, {
      block: offGridBlock,
      isRelativeSnapEnabled: true,
    });

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 1.1 * PIXELS_PER_BEAT, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 1.33 * PIXELS_PER_BEAT, pageY: 0});

    expect(moved[0]?.startBeat).toBeCloseTo(1.35);
    expect(moved[0]?.trackId).toBe('t1');
  });

  it('allows unsnapped clip movement when snap is off', () => {
    const {handlers, moved} = buildHandlers('off');

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 0.6 * PIXELS_PER_BEAT, pageY: 0});

    expect(moved).toEqual([{startBeat: 0.6, trackId: 't1'}]);
  });

  it('uses the active timeline zoom scale for drag distance', () => {
    const {handlers, moved} = buildHandlers('off', 96);

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 2 * 96, pageY: 0});

    expect(moved).toEqual([{startBeat: 2, trackId: 't1'}]);
  });

  it('commits MIDI left-edge drags as resize-left, not move', () => {
    const moved: Array<{startBeat: number; trackId: string}> = [];
    const resized: Array<{startBeat: number; lengthBeats: number}> = [];
    const handlers = createBlockPointerHandlers({
      block,
      blocks: [block],
      trackCount: 1,
      trackIds: ['t1'],
      maxTimelineBeat: 64,
      pixelsPerBeat: PIXELS_PER_BEAT,
      snapGrid: 'off',
      metrics: {
        left: {setValue: jest.fn()},
        width: {setValue: jest.fn()},
      },
      dragStartXRef: {current: 0},
      dragStartBeatRef: {current: 0},
      dragStartLengthRef: {current: 4},
      dragStartTrackIndexRef: {current: 0},
      isDraggingRef: {current: false},
      sessionRef: {current: null},
      onSelectBlock: jest.fn(),
      onDraggingChange: jest.fn(),
      onMoveBlock: (_blockId, startBeat, trackId) => moved.push({startBeat, trackId}),
      onResizeBlock: (_blockId, startBeat, lengthBeats) => resized.push({startBeat, lengthBeats}),
    });

    handlers.onResizeLeftPointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: PIXELS_PER_BEAT, pageY: 0});

    expect(moved).toEqual([]);
    expect(resized).toEqual([{startBeat: 1, lengthBeats: 3}]);
  });

  it('cancels and resets when a drag move arrives after the primary button was lost', () => {
    const leftSet = jest.fn();
    const widthSet = jest.fn();
    const dragging = jest.fn();
    const resized: Array<{startBeat: number; lengthBeats: number}> = [];
    const handlers = createBlockPointerHandlers({
      block: {...block, startBeat: 2, lengthBeats: 4},
      blocks: [{...block, startBeat: 2, lengthBeats: 4}],
      trackCount: 1,
      trackIds: ['t1'],
      maxTimelineBeat: 64,
      pixelsPerBeat: PIXELS_PER_BEAT,
      snapGrid: 'off',
      metrics: {
        left: {setValue: leftSet},
        width: {setValue: widthSet},
      },
      dragStartXRef: {current: 0},
      dragStartBeatRef: {current: 0},
      dragStartLengthRef: {current: 4},
      dragStartTrackIndexRef: {current: 0},
      isDraggingRef: {current: false},
      sessionRef: {current: null},
      onSelectBlock: jest.fn(),
      onDraggingChange: dragging,
      onMoveBlock: jest.fn(),
      onResizeBlock: (_blockId, startBeat, lengthBeats) => resized.push({startBeat, lengthBeats}),
    });

    handlers.onResizeRightPointerDown({button: 0, pointerId: 3, pageX: 2 * PIXELS_PER_BEAT, pageY: 0} as PointerEvent);
    handlers.onPointerMove({pointerId: 3, pageX: 6 * PIXELS_PER_BEAT, pageY: 0, buttons: 0});
    handlers.onPointerUp({pointerId: 3, pageX: 6 * PIXELS_PER_BEAT, pageY: 0});

    expect(resized).toEqual([]);
    expect(leftSet).toHaveBeenLastCalledWith(2 * PIXELS_PER_BEAT);
    expect(widthSet).toHaveBeenLastCalledWith(4 * PIXELS_PER_BEAT);
    expect(dragging).toHaveBeenLastCalledWith(false);
  });

  it('uses the active row height for vertical track moves', () => {
    const moved: Array<{startBeat: number; trackId: string}> = [];
    const handlers = createBlockPointerHandlers({
      block,
      blocks: [block],
      trackCount: 2,
      trackIds: ['t1', 't2'],
      maxTimelineBeat: 64,
      rowHeight: 128,
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
    handlers.onPointerUp({pointerId: 1, pageX: 0, pageY: 50});
    expect(moved).toEqual([{startBeat: 0, trackId: 't1'}]);
  });

  it('preserves an already selected clip on drag start for grouped moves', () => {
    const onSelectBlock = jest.fn();
    const handlers = createBlockPointerHandlers({
      block,
      blocks: [block],
      trackCount: 1,
      trackIds: ['t1'],
      maxTimelineBeat: 64,
      metrics: {
        left: {setValue: jest.fn()},
        width: {setValue: jest.fn()},
      },
      dragStartXRef: {current: 0},
      dragStartBeatRef: {current: 0},
      dragStartLengthRef: {current: 4},
      dragStartTrackIndexRef: {current: 0},
      isDraggingRef: {current: false},
      sessionRef: {current: null},
      preserveSelectionOnPointerDown: true,
      onSelectBlock,
      onDraggingChange: jest.fn(),
      onMoveBlock: jest.fn(),
      onResizeBlock: jest.fn(),
    });

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);

    expect(onSelectBlock).not.toHaveBeenCalled();
  });

  it('passes raw move targets through for grouped move commits', () => {
    const moved: Array<{startBeat: number; trackId: string}> = [];
    const handlers = createBlockPointerHandlers({
      block,
      blocks: [
        block,
        {...block, id: 'clip-2', startBeat: 4},
      ],
      trackCount: 1,
      trackIds: ['t1'],
      maxTimelineBeat: 64,
      metrics: {
        left: {setValue: jest.fn()},
        width: {setValue: jest.fn()},
      },
      dragStartXRef: {current: 0},
      dragStartBeatRef: {current: 0},
      dragStartLengthRef: {current: 4},
      dragStartTrackIndexRef: {current: 0},
      isDraggingRef: {current: false},
      sessionRef: {current: null},
      preserveSelectionOnPointerDown: true,
      onSelectBlock: jest.fn(),
      onDraggingChange: jest.fn(),
      onMoveBlock: (_blockId, startBeat, trackId) => moved.push({startBeat, trackId}),
      onResizeBlock: jest.fn(),
    });

    handlers.onMovePointerDown({button: 0, pointerId: 1, pageX: 0, pageY: 0} as PointerEvent);
    handlers.onPointerUp({pointerId: 1, pageX: 2 * PIXELS_PER_BEAT, pageY: 0});

    expect(moved).toEqual([{startBeat: 2, trackId: 't1'}]);
  });
});
