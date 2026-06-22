import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createPortal} from 'react-dom';

import {isDrumPatternBlock} from '../../music/clipFactories';
import type {DAWBlock, RecordingCompVersion} from '../../store/useDAWStore';
import {
  BLOCK_VERTICAL_PADDING,
  RECORDING_MIN_VISIBLE_BEATS,
  RESIZE_HANDLE_WIDTH,
} from '../../ui/timelineLayout';
import type {SnapGrid} from '../../ui/snapGrid';
import {
  createBlockPointerHandlers,
  isMoveLeftEdgeBlock,
  usesOverlayClipShell,
  type BlockDragMode,
  type PointerSession,
} from '../../ui/timelineBlockPointerDrag';
import {previewAudioSourceOffsetBeats} from '../../ui/timelineClipPreview';
import type {TimelineTrackLaneLayout} from '../../ui/timelineTrackLanes';
import {ClipContent, type ClipPreviewState} from './ClipContent';
import {clearImportedBlockPointerDragSuppression} from '../../ui/timelineImportDragSuppression';

type TimelineBlockProps = {
  block: DAWBlock;
  blocks: DAWBlock[];
  top: number;
  isSelected: boolean;
  isGroupSelected: boolean;
  isTrackMuted?: boolean;
  trackCount: number;
  maxTimelineBeat: number;
  pixelsPerBeat: number;
  rowHeight: number;
  trackLaneLayout: TimelineTrackLaneLayout;
  snapGrid: SnapGrid;
  isRelativeSnapEnabled: boolean;
  beatsPerBar: number;
  onMoveBlock: (blockId: string, startBeat: number, trackId: string) => void;
  onResizeBlock: (blockId: string, startBeat: number, lengthBeats: number) => void;
  onSelectBlock: (blockId: string, options?: {additive?: boolean}) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Pick<DAWBlock, 'name'>>) => void;
  onDeleteBlock: (blockId: string) => void;
  onDraggingChange: (isDragging: boolean) => void;
  trackIds: string[];
  readOnly?: boolean;
  isTakeFolderExpanded?: boolean;
  onToggleTakeFolder?: (groupId: string) => void;
  onQuickSwipeComp?: (block: DAWBlock, startBeat: number, endBeat: number) => void;
  onFlattenComp?: (groupId: string) => void;
  quickSwipeMode?: boolean;
  takeFolderMode?: 'quick-swipe' | 'edit';
  onTakeFolderModeChange?: (groupId: string, mode: 'quick-swipe' | 'edit') => void;
  isAuditioning?: boolean;
  onAuditionTake?: (takeId: string | null) => void;
  onSelectCompTake?: (groupId: string, takeId: string) => void;
  compVersions?: RecordingCompVersion[];
  activeCompVersionId?: string;
  onSwitchCompVersion?: (groupId: string, versionId: string) => void;
  onDuplicateCompVersion?: (groupId: string) => void;
  onRenameCompVersion?: (groupId: string, versionId: string, name: string) => void;
};

export function TimelineBlock({
  block,
  blocks,
  top,
  isSelected,
  isGroupSelected,
  isTrackMuted,
  trackCount,
  maxTimelineBeat,
  pixelsPerBeat,
  rowHeight,
  trackLaneLayout,
  snapGrid,
  isRelativeSnapEnabled,
  beatsPerBar,
  onMoveBlock,
  onResizeBlock,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDraggingChange,
  trackIds,
  readOnly = false,
  isTakeFolderExpanded = false,
  onToggleTakeFolder,
  onQuickSwipeComp,
  onFlattenComp,
  quickSwipeMode = true,
  takeFolderMode = 'quick-swipe',
  onTakeFolderModeChange,
  isAuditioning = false,
  onAuditionTake,
  onSelectCompTake,
  compVersions = [],
  activeCompVersionId,
  onSwitchCompVersion,
}: TimelineBlockProps) {
  const displayLengthBeats = block.name === 'Recording'
    ? Math.max(block.lengthBeats, RECORDING_MIN_VISIBLE_BEATS)
    : block.lengthBeats;
  const overlayShell = usesOverlayClipShell(block);
  const widthInset = overlayShell ? 0 : 6;
  const musicalWidthPx = displayLengthBeats * pixelsPerBeat;
  const storeWidthPx = musicalWidthPx - widthInset;
  const blockRef = useRef<HTMLDivElement>(null);
  const [left, setLeft] = useState(block.startBeat * pixelsPerBeat);
  const [width, setWidth] = useState(storeWidthPx);
  const [isDragging, setIsDragging] = useState(false);
  const [dragMode, setDragMode] = useState<BlockDragMode | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCompMenuOpen, setIsCompMenuOpen] = useState(false);
  const [compMenuPosition, setCompMenuPosition] = useState<{top: number; left: number} | null>(null);
  const dragStartX = useRef(0);
  const dragStartBeat = useRef(block.startBeat);
  const dragStartLength = useRef(displayLengthBeats);
  const dragStartTrackIndex = useRef(0);
  const isDraggingRef = useRef(false);
  const sessionRef = useRef<PointerSession | null>(null);
  const quickSwipeStartX = useRef<number | null>(null);
  const blockHeight = rowHeight - BLOCK_VERTICAL_PADDING * 2;
  const compGroupId = block.recordingCompGroupId ?? block.recordingTakeGroupId;
  const isCompOutput = Boolean(block.recordingCompGroupId);
  const isTakeSourceLane = readOnly && Boolean(block.recordingTakeGroupId);
  const isQuickSwipeLane = isTakeSourceLane && quickSwipeMode;
  const nextTakeFolderMode = takeFolderMode === 'quick-swipe' ? 'edit' : 'quick-swipe';
  const takeMenuItems = useMemo(() => {
    if (!compGroupId) {
      return [];
    }
    return blocks
      .filter(item => item.recordingTakeGroupId === compGroupId && !item.recordingCompGroupId)
      .sort((left, right) => (right.recordingTakeIndex ?? 0) - (left.recordingTakeIndex ?? 0))
      .map(item => ({
        id: item.recordingTakeId ?? item.id,
        label: `Take ${(item.recordingTakeIndex ?? 0) + 1}`,
      }));
  }, [blocks, compGroupId]);
  const compSegmentViews = useMemo(() => {
    if (!isCompOutput || !block.recordingCompSegments?.length) {
      return [];
    }
    return block.recordingCompSegments.map((segment, index) => {
      const take = blocks.find(item =>
        item.recordingTakeId === segment.takeId || item.id === segment.takeId,
      );
      return {
        id: segment.id,
        index,
        label: take?.recordingTakeIndex !== undefined ? `T${take.recordingTakeIndex + 1}` : `T${index + 1}`,
        leftPct: `${Math.max(0, ((segment.startBeat - block.startBeat) / displayLengthBeats) * 100)}%`,
        widthPct: `${Math.max(0, ((segment.endBeat - segment.startBeat) / displayLengthBeats) * 100)}%`,
      };
    });
  }, [block.recordingCompSegments, block.startBeat, blocks, displayLengthBeats, isCompOutput]);

  const displayWidthPx = overlayShell && isDragging ? width + widthInset : overlayShell ? storeWidthPx : width;

  useEffect(() => {
    if (isDragging) {
      return;
    }
    setLeft(block.startBeat * pixelsPerBeat);
    setWidth(storeWidthPx);
    dragStartLength.current = displayLengthBeats;
  }, [block.startBeat, displayLengthBeats, isDragging, pixelsPerBeat, storeWidthPx]);

  useEffect(() => {
    if (!isSelected) {
      setIsRenaming(false);
    }
  }, [isSelected]);

  useEffect(() => {
    if (!isCompMenuOpen) {
      return;
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (target?.closest('.take-folder-menu, .take-folder-menu-button')) {
        return;
      }
      setIsCompMenuOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [isCompMenuOpen]);

  const pointerHandlers = useMemo(
    () =>
      createBlockPointerHandlers({
        block,
        blocks,
        trackCount,
        trackIds,
        maxTimelineBeat,
        pixelsPerBeat,
        rowHeight,
        trackLaneLayout,
        snapGrid,
        isRelativeSnapEnabled,
        beatsPerBar,
        metrics: {left: {setValue: setLeft}, width: {setValue: setWidth}},
        dragStartXRef: dragStartX,
        dragStartBeatRef: dragStartBeat,
        dragStartLengthRef: dragStartLength,
        dragStartTrackIndexRef: dragStartTrackIndex,
        isDraggingRef,
        sessionRef,
        preserveSelectionOnPointerDown: isGroupSelected,
        onSelectBlock,
        onDraggingChange: dragging => {
          setIsDragging(dragging);
          setDragMode(dragging ? sessionRef.current?.mode ?? null : null);
          onDraggingChange(dragging);
        },
        onMoveBlock,
        onResizeBlock,
      }),
    [
      block,
      blocks,
      beatsPerBar,
      isGroupSelected,
      maxTimelineBeat,
      pixelsPerBeat,
      rowHeight,
      trackLaneLayout,
      isRelativeSnapEnabled,
      onDraggingChange,
      onMoveBlock,
      onResizeBlock,
      onSelectBlock,
      snapGrid,
      trackCount,
      trackIds,
    ],
  );

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => pointerHandlers.onPointerMove(event);
    const handlePointerUp = (event: PointerEvent) => pointerHandlers.onPointerUp(event);
    const handlePointerCancel = (event: PointerEvent) => pointerHandlers.onPointerCancel(event);
    const cancelDrag = () => pointerHandlers.cancelActiveSession();
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        cancelDrag();
      }
    };

    window.addEventListener('pointermove', handlePointerMove, true);
    window.addEventListener('pointerup', handlePointerUp, true);
    window.addEventListener('pointercancel', handlePointerCancel, true);
    window.addEventListener('blur', cancelDrag);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove, true);
      window.removeEventListener('pointerup', handlePointerUp, true);
      window.removeEventListener('pointercancel', handlePointerCancel, true);
      window.removeEventListener('blur', cancelDrag);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isDragging, pointerHandlers]);

  const startPointer = (
    event: React.PointerEvent<HTMLElement>,
    handler: unknown,
  ) => {
    event.stopPropagation();
    const captureTarget = blockRef.current ?? event.currentTarget;
    captureTarget.setPointerCapture(event.pointerId);
    (handler as (event: React.PointerEvent<HTMLElement>) => void)(event);
  };

  const clearImportDragSuppressionWhenIdle = (event: React.PointerEvent<HTMLElement>) => {
    if (event.buttons === 0) {
      clearImportedBlockPointerDragSuppression(block.id);
    }
  };

  const startQuickSwipe = (event: React.PointerEvent<HTMLElement>) => {
    if (isTakeSourceLane && !quickSwipeMode) {
      event.stopPropagation();
      onSelectBlock(block.id);
      return;
    }
    if (!isQuickSwipeLane || !onQuickSwipeComp) {
      if (readOnly) {
        event.stopPropagation();
        if (isCompOutput) {
          onSelectBlock(block.id);
        }
        return;
      }
      startPointer(event, pointerHandlers.onMovePointerDown);
      return;
    }
    event.stopPropagation();
    quickSwipeStartX.current = event.clientX;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const finishQuickSwipe = (event: React.PointerEvent<HTMLElement>) => {
    if (quickSwipeStartX.current === null || !onQuickSwipeComp || !blockRef.current) {
      return;
    }
    const rect = blockRef.current.getBoundingClientRect();
    const startX = Math.min(quickSwipeStartX.current, event.clientX);
    const endX = Math.max(quickSwipeStartX.current, event.clientX);
    quickSwipeStartX.current = null;
    const startBeat = block.startBeat + Math.max(0, startX - rect.left) / pixelsPerBeat;
    const endBeat = block.startBeat + Math.min(rect.width, endX - rect.left) / pixelsPerBeat;
    onQuickSwipeComp(block, startBeat, endBeat);
  };

  const openCompMenu = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setCompMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 300)),
    });
    setIsCompMenuOpen(open => !open);
  };

  const compMenu = isCompMenuOpen && compMenuPosition && compGroupId && typeof document !== 'undefined'
    ? createPortal(
        <div
          className="take-folder-menu"
          role="menu"
          style={{top: compMenuPosition.top, left: compMenuPosition.left}}>
          {compVersions.map(version => (
            <button
              key={version.id}
              type="button"
              className={version.id === activeCompVersionId ? 'active' : ''}
              role="menuitem"
              onClick={event => {
                event.stopPropagation();
                onSwitchCompVersion?.(compGroupId, version.id);
                setIsCompMenuOpen(false);
              }}>
              {version.name}
            </button>
          ))}
          {takeMenuItems.map(item => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              onClick={event => {
                event.stopPropagation();
                onSelectCompTake?.(compGroupId, item.id);
                setIsCompMenuOpen(false);
              }}>
              {item.label}
            </button>
          ))}
          <span className="take-folder-menu-divider" />
          <button
            type="button"
            role="menuitem"
            onClick={event => {
              event.stopPropagation();
              onFlattenComp?.(compGroupId);
              setIsCompMenuOpen(false);
            }}>
            Flatten and Merge
          </button>
        </div>,
        document.body,
      )
    : null;

  const blockClasses = `timeline-block ${readOnly ? 'timeline-block-ghost' : ''} ${isCompOutput ? 'timeline-block-take-folder' : ''} ${isTakeSourceLane ? 'timeline-block-take-lane' : ''} ${isQuickSwipeLane ? 'quick-swipe' : ''} ${isSelected ? 'selected' : ''} ${block.isMissingMedia ? 'missing-media' : ''}`;
  const labelRow = (
    <div className="block-label-row">
      {isCompOutput && compGroupId ? (
        <button
          type="button"
          className="take-folder-toggle"
          aria-label={isTakeFolderExpanded ? 'Collapse take folder' : 'Expand take folder'}
          aria-expanded={isTakeFolderExpanded}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onToggleTakeFolder?.(compGroupId);
          }}>
          {isTakeFolderExpanded ? 'v' : '>'}
        </button>
      ) : null}
      <span className="block-type">
        {block.isMissingMedia
          ? 'MISSING'
          : block.type === 'audio' && block.isMuted
            ? 'MUTED'
            : block.type === 'midi'
              ? 'MIDI'
              : 'AUDIO'}
      </span>
      {isSelected && isRenaming ? (
        <input
          className="block-name-input"
          value={block.name}
          autoFocus
          onChange={event => onUpdateBlock(block.id, {name: event.target.value})}
          onBlur={() => setIsRenaming(false)}
          onPointerDown={event => event.stopPropagation()}
        />
      ) : (
        <span className="block-name" onDoubleClick={() => setIsRenaming(true)}>
          {block.name}
        </span>
      )}
      {isCompOutput ? (
        <div className="take-folder-compact-controls" onPointerDown={event => event.stopPropagation()}>
          <button
            type="button"
            className="take-folder-menu-button"
            aria-label="Take folder menu"
            aria-haspopup="menu"
            aria-expanded={isCompMenuOpen}
            onClick={openCompMenu}>
            A
            <i aria-hidden="true" className="fa-solid fa-angle-down" />
          </button>
          {compMenu}
          <button
            type="button"
            className={`take-folder-mode-button ${takeFolderMode === 'quick-swipe' ? 'active' : ''}`}
            aria-label={takeFolderMode === 'quick-swipe' ? 'Switch to Edit' : 'Switch to Quick Swipe'}
            aria-pressed={takeFolderMode === 'quick-swipe'}
            onClick={event => {
              event.stopPropagation();
              if (compGroupId) {
                onTakeFolderModeChange?.(compGroupId, nextTakeFolderMode);
              }
            }}>
            {takeFolderMode === 'quick-swipe' ? 'QS' : 'Edit'}
          </button>
        </div>
      ) : null}
      {isTakeSourceLane ? (
        <button
          type="button"
          className={`take-audition-button ${isAuditioning ? 'active' : ''}`}
          onPointerDown={event => event.stopPropagation()}
          onClick={event => {
            event.stopPropagation();
            onAuditionTake?.(isAuditioning ? null : block.recordingTakeId ?? block.id);
          }}>
          {isAuditioning ? 'Auditioning' : 'Audition'}
        </button>
      ) : null}
      {block.isMissingMedia ? <span className="missing-media-badge">Relink needed</span> : null}
    </div>
  );

  const contentWidthPx = overlayShell ? displayWidthPx : width + widthInset;

  const previewLengthBeats = isDragging
    ? Math.max(1, Math.round(contentWidthPx / pixelsPerBeat))
    : displayLengthBeats;
  const previewStartBeat = isDragging ? left / pixelsPerBeat : block.startBeat;
  const clipPreview: ClipPreviewState | undefined = isDragging
    ? {
        lengthBeats: previewLengthBeats,
        startBeat: previewStartBeat,
        midiTrimStartBeat:
          block.type === 'midi' && dragMode === 'resize-left'
            ? previewStartBeat
            : undefined,
        sourceOffsetBeats: previewAudioSourceOffsetBeats(block, dragMode, previewStartBeat),
        drumDimFromBeat:
          isDrumPatternBlock(block) && dragMode === 'resize-right'
            ? dragStartLength.current
            : undefined,
      }
    : undefined;

  if (overlayShell) {
    return (
      <div
        ref={blockRef}
        className={`${blockClasses} timeline-block-overlay`}
        onPointerMove={pointerHandlers.onPointerMove}
        onPointerUp={pointerHandlers.onPointerUp}
        onPointerCancel={pointerHandlers.onPointerCancel}
        onLostPointerCapture={pointerHandlers.onPointerCancel}
        onPointerEnter={clearImportDragSuppressionWhenIdle}
        style={{top, left, width: displayWidthPx, height: blockHeight}}>
        <div
          className="timeline-block-clip-surface"
          style={{backgroundColor: block.color}}
          onPointerDown={startQuickSwipe}
          onPointerUp={finishQuickSwipe}>
          <ClipContent
            block={block}
            widthPx={contentWidthPx}
            heightPx={blockHeight - 20}
            pixelsPerBeat={pixelsPerBeat}
            preview={clipPreview}
            isTrackMuted={isTrackMuted}
          />
          {compSegmentViews.length > 0 ? (
            <div className="take-folder-comp-segments" aria-hidden="true">
              {compSegmentViews.map(segment => (
                <span
                  key={segment.id}
                  className={`take-folder-comp-segment segment-${segment.index % 4}`}
                  style={{left: segment.leftPct, width: segment.widthPct}}>
                  {segment.label}
                </span>
              ))}
            </div>
          ) : null}
          {labelRow}
        </div>
        {!readOnly ? (
          <>
            <span
              className={`resize-handle left clip-edge-overlay ${isMoveLeftEdgeBlock(block) ? 'move-edge' : ''}`}
              style={{width: RESIZE_HANDLE_WIDTH}}
              onPointerDown={event => startPointer(event, pointerHandlers.onResizeLeftPointerDown)}
            />
            <span
              className="resize-handle right clip-edge-overlay"
              style={{width: RESIZE_HANDLE_WIDTH}}
              onPointerDown={event => startPointer(event, pointerHandlers.onResizeRightPointerDown)}
            />
          </>
        ) : null}
        {isSelected ? (
          <button
            className="delete-clip-button"
            type="button"
            onPointerDown={event => event.stopPropagation()}
            onClick={() => onDeleteBlock(block.id)}>
            x
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className={blockClasses}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={pointerHandlers.onPointerUp}
      onPointerCancel={pointerHandlers.onPointerCancel}
      onLostPointerCapture={pointerHandlers.onPointerCancel}
      onPointerEnter={clearImportDragSuppressionWhenIdle}
      style={{top, left, width, height: blockHeight, backgroundColor: block.color}}>
      {!readOnly ? (
        <span
          className={`resize-handle left ${isMoveLeftEdgeBlock(block) ? 'move-edge' : ''}`}
          style={{width: RESIZE_HANDLE_WIDTH}}
          onPointerDown={event => startPointer(event, pointerHandlers.onResizeLeftPointerDown)}
        />
      ) : null}
      <div className="block-body" onPointerDown={startQuickSwipe} onPointerUp={finishQuickSwipe}>
        <ClipContent
          block={block}
          widthPx={contentWidthPx}
          heightPx={blockHeight - 20}
          pixelsPerBeat={pixelsPerBeat}
          preview={clipPreview}
          isTrackMuted={isTrackMuted}
        />
        {compSegmentViews.length > 0 ? (
          <div className="take-folder-comp-segments" aria-hidden="true">
            {compSegmentViews.map(segment => (
              <span
                key={segment.id}
                className={`take-folder-comp-segment segment-${segment.index % 4}`}
                style={{left: segment.leftPct, width: segment.widthPct}}>
                {segment.label}
              </span>
            ))}
          </div>
        ) : null}
        {labelRow}
      </div>
      {!readOnly ? (
        <span
          className="resize-handle right"
          style={{width: RESIZE_HANDLE_WIDTH}}
          onPointerDown={event => startPointer(event, pointerHandlers.onResizeRightPointerDown)}
        />
      ) : null}
    </div>
  );
}
