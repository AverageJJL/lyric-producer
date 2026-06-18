import {clampAudioResizeFromLeft, clampAudioResizeFromRight, clampMoveStartBeat, clampResizeFromLeft, clampResizeFromRight} from '../music/timelineCollision';
import type {DAWBlock} from '../store/useDAWStore';
import {shouldSuppressImportedBlockPointerDrag} from './timelineImportDragSuppression';
import {PIXELS_PER_BEAT, RESIZE_HANDLE_WIDTH, ROW_HEIGHT, clamp} from './timelineLayout';
import {DEFAULT_SNAP_GRID, snapBeatToGrid, snapLengthToGrid, type SnapGrid} from './snapGrid';
import {blockResizeVisualWidthPx, isMoveLeftEdgeBlock, usesAudioTrimResize} from './timelineBlockDragCore';
import {trackIndexForDragDelta, type TimelineTrackLaneLayout} from './timelineTrackLanes';

export {blockResizeVisualWidthPx, isMoveLeftEdgeBlock, usesAudioTrimResize, usesOverlayClipShell} from './timelineBlockDragCore';

export type BlockDragMode = 'move' | 'resize-left' | 'resize-right';

type AnimatedMetrics = {
  left: {setValue: (value: number) => void};
  width: {setValue: (value: number) => void};
};

export type PointerSession = {
  mode: BlockDragMode;
  pointerId: number;
  originPageX: number;
  originPageY: number;
};

export type PointerLikeEvent = {
  nativeEvent?: {
    button?: number;
    buttons?: number;
    pageX: number;
    pageY: number;
    pointerId: number;
    pointerType?: string;
    type?: string;
  };
  button?: number;
  buttons?: number;
  pointerId: number;
  pageX: number;
  pageY: number;
  pointerType?: string;
  type?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
};

export type BlockPointerDragConfig = {
  block: DAWBlock;
  blocks: DAWBlock[];
  trackCount: number;
  trackIds: string[];
  maxTimelineBeat: number;
  pixelsPerBeat?: number;
  rowHeight?: number;
  trackLaneLayout?: TimelineTrackLaneLayout;
  snapGrid?: SnapGrid;
  isRelativeSnapEnabled?: boolean;
  beatsPerBar?: number;
  metrics: AnimatedMetrics;
  dragStartXRef: {current: number};
  dragStartBeatRef: {current: number};
  dragStartLengthRef: {current: number};
  dragStartTrackIndexRef: {current: number};
  isDraggingRef: {current: boolean};
  sessionRef: {current: PointerSession | null};
  preserveSelectionOnPointerDown?: boolean;
  onSelectBlock: (blockId: string, options?: {additive?: boolean}) => void;
  onDraggingChange: (isDragging: boolean) => void;
  onMoveBlock: (blockId: string, startBeat: number, trackId: string) => void;
  onResizeBlock: (blockId: string, startBeat: number, lengthBeats: number) => void;
};

/** Hit zone for edge resize vs body move (timeline-local X). */
export function resolveBlockDragMode(locationX: number, blockWidthPx: number): BlockDragMode {
  if (locationX <= RESIZE_HANDLE_WIDTH) {
    return 'resize-left';
  }
  if (locationX >= blockWidthPx - RESIZE_HANDLE_WIDTH) {
    return 'resize-right';
  }
  return 'move';
}

function previewTrackIndex(config: BlockPointerDragConfig, dy: number): number {
  if (config.trackLaneLayout) {
    return trackIndexForDragDelta(config.trackLaneLayout, config.block.trackId, dy);
  }
  const rowDelta = Math.round(dy / (config.rowHeight ?? ROW_HEIGHT));
  return clamp(config.dragStartTrackIndexRef.current + rowDelta, 0, Math.max(0, config.trackCount - 1));
}

function snappedBeat(config: BlockPointerDragConfig, beat: number): number {
  return snapBeatToGrid(beat, config.snapGrid ?? DEFAULT_SNAP_GRID, config.beatsPerBar);
}

function snappedMoveBeat(config: BlockPointerDragConfig, beat: number): number {
  if (!config.isRelativeSnapEnabled) { return snappedBeat(config, beat); }
  if (beat <= 0 || beat >= config.maxTimelineBeat) { return beat; }
  const snappedDelta = snappedBeat(config, beat - config.dragStartBeatRef.current);
  return clamp(config.dragStartBeatRef.current + snappedDelta, 0, config.maxTimelineBeat);
}

function snappedLength(config: BlockPointerDragConfig, lengthBeats: number): number {
  return snapLengthToGrid(lengthBeats, config.snapGrid ?? DEFAULT_SNAP_GRID, config.beatsPerBar);
}

function pixelsPerBeat(config: BlockPointerDragConfig): number { return config.pixelsPerBeat ?? PIXELS_PER_BEAT; }

function applyMoveVisuals(config: BlockPointerDragConfig, dx: number, dy: number): void {
  const ppb = pixelsPerBeat(config);
  const maxPx = config.maxTimelineBeat * ppb;
  const rawLeft = config.dragStartXRef.current + dx;
  const rawBeat = snappedMoveBeat(config, clamp(rawLeft, 0, maxPx) / ppb);
  const trackIndex = previewTrackIndex(config, dy);
  const trackId = config.trackIds[trackIndex] ?? config.block.trackId;
  if (config.preserveSelectionOnPointerDown) {
    config.metrics.left.setValue(rawBeat * ppb);
    return;
  }

  const clampedStart = clampMoveStartBeat(
    config.blocks,
    config.block.id,
    trackId,
    config.dragStartLengthRef.current,
    rawBeat,
    config.maxTimelineBeat,
  );

  config.metrics.left.setValue(clampedStart * ppb);
}

function applyResizeLeftVisuals(config: BlockPointerDragConfig, dx: number): void {
  const ppb = pixelsPerBeat(config);
  const fixedEnd = config.dragStartBeatRef.current + config.dragStartLengthRef.current;
  const maxPx = (fixedEnd - 1) * ppb;
  const rawLeft = config.dragStartXRef.current + dx;
  const desiredStart = snappedBeat(config, clamp(rawLeft, 0, maxPx) / ppb);

  const clamped = usesAudioTrimResize(config.block)
    ? clampAudioResizeFromLeft(config.blocks, config.block, desiredStart, fixedEnd)
    : clampResizeFromLeft(config.blocks, config.block.id, config.block.trackId, desiredStart, fixedEnd);

  config.metrics.left.setValue(clamped.startBeat * ppb);
  config.metrics.width.setValue(blockResizeVisualWidthPx(config.block, clamped.lengthBeats, ppb));
}

function applyResizeRightVisuals(config: BlockPointerDragConfig, dx: number): void {
  const ppb = pixelsPerBeat(config);
  const rawWidth = config.dragStartLengthRef.current * ppb + dx;
  const desiredLength = snappedLength(config, Math.max(1, rawWidth / ppb));

  const clampedLength = usesAudioTrimResize(config.block)
    ? clampAudioResizeFromRight(config.blocks, config.block, desiredLength, config.maxTimelineBeat)
    : clampResizeFromRight(
        config.blocks,
        config.block.id,
        config.block.trackId,
        config.dragStartBeatRef.current,
        desiredLength,
        config.maxTimelineBeat,
      );

  config.metrics.width.setValue(blockResizeVisualWidthPx(config.block, clampedLength, ppb));
}

function applyDragVisuals(
  config: BlockPointerDragConfig,
  mode: BlockDragMode,
  dx: number,
  dy: number,
): void {
  if (mode === 'move') {
    applyMoveVisuals(config, dx, dy);
    return;
  }

  if (mode === 'resize-left') {
    applyResizeLeftVisuals(config, dx);
    return;
  }

  applyResizeRightVisuals(config, dx);
}

function commitDrag(config: BlockPointerDragConfig, mode: BlockDragMode, dx: number, dy: number): void {
  const {block, dragStartXRef, dragStartBeatRef, dragStartLengthRef, trackIds, onMoveBlock, onResizeBlock} =
    config;
  const ppb = pixelsPerBeat(config);
  const maxPx = config.maxTimelineBeat * ppb;

  if (mode === 'move') {
    const rawLeft = dragStartXRef.current + dx;
    const rawBeat = snappedMoveBeat(config, clamp(rawLeft, 0, maxPx) / ppb);
    const trackIndex = previewTrackIndex(config, dy);
    const nextTrackId = trackIds[trackIndex] ?? block.trackId;
    if (config.preserveSelectionOnPointerDown) {
      onMoveBlock(block.id, rawBeat, nextTrackId);
      return;
    }

    const clampedStart = clampMoveStartBeat(
      config.blocks,
      block.id,
      nextTrackId,
      dragStartLengthRef.current,
      rawBeat,
      config.maxTimelineBeat,
    );
    onMoveBlock(block.id, clampedStart, nextTrackId);
    return;
  }

  if (mode === 'resize-left') {
    const fixedEnd = dragStartBeatRef.current + dragStartLengthRef.current;
    const rawLeft = dragStartXRef.current + dx;
    const desiredStart = snappedBeat(
      config,
      clamp(rawLeft, 0, (fixedEnd - 1) * ppb) / ppb,
    );
    const clamped = usesAudioTrimResize(block)
      ? clampAudioResizeFromLeft(config.blocks, block, desiredStart, fixedEnd)
      : clampResizeFromLeft(config.blocks, block.id, block.trackId, desiredStart, fixedEnd);
    onResizeBlock(block.id, clamped.startBeat, clamped.lengthBeats);
    return;
  }

  const rawWidth = dragStartLengthRef.current * ppb + dx;
  const desiredLength = snappedLength(config, Math.max(1, rawWidth / ppb));
  const clampedLength = usesAudioTrimResize(block)
    ? clampAudioResizeFromRight(config.blocks, block, desiredLength, config.maxTimelineBeat)
    : clampResizeFromRight(
        config.blocks,
        block.id,
        block.trackId,
        dragStartBeatRef.current,
        desiredLength,
        config.maxTimelineBeat,
      );
  onResizeBlock(block.id, dragStartBeatRef.current, clampedLength);
}

export function createBlockPointerHandlers(config: BlockPointerDragConfig) {
  const beginSession = (mode: BlockDragMode, event: PointerLikeEvent) => {
    const pointer = pointerData(event);
    if (pointer.button !== undefined && pointer.button !== 0) {
      return;
    }

    if (shouldSuppressImportedBlockPointerDrag(config.block.id)) {
      return;
    }

    config.sessionRef.current = {
      mode,
      pointerId: pointer.pointerId,
      originPageX: pointer.pageX,
      originPageY: pointer.pageY,
    };
    config.dragStartXRef.current = config.block.startBeat * pixelsPerBeat(config);
    config.dragStartBeatRef.current = config.block.startBeat;
    config.dragStartLengthRef.current = config.block.lengthBeats;
    config.dragStartTrackIndexRef.current = Math.max(0, config.trackIds.indexOf(config.block.trackId));
    config.isDraggingRef.current = true;
    const additive = Boolean(pointer.ctrlKey || pointer.metaKey || pointer.shiftKey);
    if (!config.preserveSelectionOnPointerDown || additive) {
      config.onSelectBlock(config.block.id, {additive});
    }
    config.onDraggingChange(true);
  };

  const onPointerMove = (event: PointerLikeEvent) => {
    const session = config.sessionRef.current;
    const pointer = pointerData(event);
    if (!session || pointer.pointerId !== session.pointerId) {
      return;
    }

    const dx = pointer.pageX - session.originPageX;
    const dy = pointer.pageY - session.originPageY;
    applyDragVisuals(config, session.mode, dx, dy);
  };

  const cleanupSession = () => {
    config.sessionRef.current = null;
    config.isDraggingRef.current = false;
    config.onDraggingChange(false);
  };

  const finish = (event: PointerLikeEvent) => {
    const session = config.sessionRef.current;
    const pointer = pointerData(event);
    if (!session || pointer.pointerId !== session.pointerId) {
      return;
    }

    const commitDx = pointer.pageX - session.originPageX;
    const commitDy = pointer.pageY - session.originPageY;
    commitDrag(config, session.mode, commitDx, commitDy);
    cleanupSession();
  };

  const cancel = (event: PointerLikeEvent) => {
    const session = config.sessionRef.current;
    const pointer = pointerData(event);
    if (!session || pointer.pointerId !== session.pointerId) {
      return;
    }
    cleanupSession();
  };

  return {
    onPointerMove,
    onPointerUp: finish,
    onPointerCancel: cancel,
    onMovePointerDown: (event: PointerEvent) => beginSession('move', event),
    onResizeLeftPointerDown: (event: PointerEvent) =>
      beginSession(isMoveLeftEdgeBlock(config.block) ? 'move' : 'resize-left', event),
    onResizeRightPointerDown: (event: PointerEvent) => beginSession('resize-right', event),
  };
}

function pointerData(event: PointerLikeEvent): {
  button?: number;
  buttons?: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  pageX: number;
  pageY: number;
  pointerId: number;
  pointerType?: string;
  shiftKey?: boolean;
  type?: string;
} {
  return event.nativeEvent ?? event;
}
