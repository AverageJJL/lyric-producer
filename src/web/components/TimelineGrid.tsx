import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {flattenRecordingCompGroupInPlace} from '../../arrangement/recordingCompFlatten';
import {
  decodeCopilotDrumPatternDrag,
  COPILOT_DRUM_PATTERN_DRAG_TYPE,
} from '../../assistant/copilotDrumPatternDrag';
import {
  importCopilotDrumPatternOption,
  sanitizeCopilotDrumPatternOptions,
} from '../../assistant/copilotDrumPatternOptions';
import {stopCopilotDrumPatternPreview} from '../../assistant/copilotDrumPatternPreview';
import {
  decodeCopilotMidiOptionDrag,
  COPILOT_MIDI_OPTION_DRAG_TYPE,
} from '../../assistant/copilotMidiOptionDrag';
import {
  importCopilotMidiOption,
  sanitizeCopilotMidiOptions,
} from '../../assistant/copilotMidiOptions';
import {stopCopilotMidiOptionPreview} from '../../assistant/copilotMidiPreview';
import {getMediaImportBridge} from '../../native/mediaImportApi';
import {beatsPerBarForTimeSignature} from '../../store/projectMetadata';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import {useDAWStore} from '../../store/useDAWStore';
import {upsertRecordingCompGroup} from '../../store/useDAWNativeBridge';
import {
  compSourceTakeBlocks,
  compVersionState,
  recordingCompFolderRange,
} from '../../transport/recordingComp';
import {useTimelineOriginScroll} from '../../hooks/useTimelineOriginScroll';
import {useTimelineSurfaceHeight} from '../../hooks/useTimelineSurfaceHeight';
import {computeVisibleTimelineBeats, timelineWidthPx} from '../../ui/timelineExtent';
import {nextTimelineScrollLeft} from '../../ui/timelineFollowScroll';
import {
  BLOCK_VERTICAL_PADDING,
  PIXELS_PER_BEAT,
  RULER_HEIGHT,
} from '../../ui/timelineLayout';
import {
  clampTimelinePixelsPerBeat,
  clampTimelineRowHeight,
  fitTimelinePixelsPerBeat,
} from '../../ui/timelineZoom';
import {snapBeatToGrid} from '../../ui/snapGrid';
import {buildTimelineRulerModel} from '../../ui/timelineRulerMap';
import {buildTimelineDisplayLaneLayout} from '../../ui/timelineDisplayLanes';
import {PlayheadScrubber} from './PlayheadScrubber';
import {TimelineAutomationLanes} from './TimelineAutomationLanes';
import {TimelineBlock} from './TimelineBlock';
import {TimelineMarqueeLayer} from './TimelineMarqueeLayer';
import {TimelineRulerLayer} from './TimelineRulerLayer';
import {TimelineToolbar} from './TimelineToolbar';
import {displayTimelineBlocks} from './timelineDisplayBlocks';

type TimelineGridProps = {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  verticalScrollRef: React.RefObject<HTMLDivElement | null>;
  onVerticalScroll: (event: React.UIEvent<HTMLDivElement>) => void;
  rowHeight: number;
  expandedTakeGroups: string[];
  onToggleTakeFolder: (groupId: string) => void;
  onRowHeightChange: (rowHeight: number) => void;
  onMoveBlock: (blockId: string, startBeat: number, trackId: string) => void;
  onResizeBlock: (blockId: string, startBeat: number, lengthBeats: number) => void;
  onSelectBlock: (blockId: string | null, options?: {additive?: boolean}) => void;
  onUpdateBlock: (blockId: string, updates: Partial<Pick<DAWBlock, 'name'>>) => void;
  onDeleteBlock: (blockId: string) => void;
};

export function TimelineGrid({
  tracks,
  blocks,
  selectedBlockId,
  selectedBlockIds,
  verticalScrollRef,
  onVerticalScroll,
  rowHeight,
  expandedTakeGroups,
  onToggleTakeFolder,
  onRowHeightChange,
  onMoveBlock,
  onResizeBlock,
  onSelectBlock,
  onUpdateBlock,
  onDeleteBlock,
}: TimelineGridProps) {
  const [isDraggingBlock, setIsDraggingBlock] = useState(false);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(PIXELS_PER_BEAT);
  const [compRenderError, setCompRenderError] = useState<string | null>(null);
  const [takeFolderModes, setTakeFolderModes] = useState<Record<string, 'quick-swipe' | 'edit'>>({});
  const horizontalScrollRef = useRef<HTMLDivElement>(null);
  const timelineSurfaceRef = useRef<HTMLDivElement>(null);
  const followPlayheadRef = useRef(true);
  const scrollFromFollowRef = useRef(false);
  const autoExpandedTakeGroupsRef = useRef(new Set<string>());
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const isPlaying = useDAWStore(state => state.isPlaying);
  const isRecording = useDAWStore(state => state.isRecording);
  const recordingBlockId = useDAWStore(state => state.recordingBlockId);
  const liveMidiPreviewByTrack = useDAWStore(state => state.liveMidiPreviewByTrack);
  const snapGrid = useDAWStore(state => state.snapGrid);
  const setSnapGrid = useDAWStore(state => state.setSnapGrid);
  const isRelativeSnapEnabled = useDAWStore(state => state.isRelativeSnapEnabled);
  const setTrackAutomationPoint = useDAWStore(state => state.setTrackAutomationPoint);
  const removeTrackAutomationPoint = useDAWStore(state => state.removeTrackAutomationPoint);
  const timeSignature = useDAWStore(state => state.timeSignature);
  const beatsPerBar = beatsPerBarForTimeSignature(timeSignature);
  const meterMap = useDAWStore(state => state.meterMap);
  const tempoMap = useDAWStore(state => state.tempoMap);
  const sections = useDAWStore(state => state.sections);
  const setSections = useDAWStore(state => state.setSections);
  const setRecordingCompRange = useDAWStore(state => state.setRecordingCompRange);
  const auditionedRecordingTakeId = useDAWStore(state => state.auditionedRecordingTakeId);
  const setAuditionedRecordingTake = useDAWStore(state => state.setAuditionedRecordingTake);
  const selectRecordingCompTake = useDAWStore(state => state.selectRecordingCompTake);
  const switchRecordingCompVersion = useDAWStore(state => state.switchRecordingCompVersion);
  const duplicateRecordingCompVersion = useDAWStore(state => state.duplicateRecordingCompVersion);
  const renameRecordingCompVersion = useDAWStore(state => state.renameRecordingCompVersion);

  const visibleTimelineBeats = useMemo(
    () =>
      computeVisibleTimelineBeats({
        blocks,
        playheadBeat,
        recordingBlockId,
      }),
    [blocks, playheadBeat, recordingBlockId],
  );

  const timelineWidth = timelineWidthPx(visibleTimelineBeats, pixelsPerBeat);
  const displayLaneLayout = useMemo(
    () => buildTimelineDisplayLaneLayout(tracks, blocks, expandedTakeGroups, rowHeight),
    [blocks, expandedTakeGroups, rowHeight, tracks],
  );
  const trackLaneLayout = displayLaneLayout.realTrackLaneLayout;
  const surfaceHeight = useTimelineSurfaceHeight(verticalScrollRef, displayLaneLayout.contentHeight);
  const trackLaneMap = useMemo(
    () => new Map(trackLaneLayout.lanes.map(lane => [lane.trackId, lane])),
    [trackLaneLayout],
  );
  const takeLaneMap = useMemo(
    () => new Map(
      displayLaneLayout.lanes
        .filter(lane => lane.kind === 'take')
        .map(lane => [lane.sourceBlockId, lane]),
    ),
    [displayLaneLayout],
  );
  const trackIds = useMemo(() => tracks.map(track => track.id), [tracks]);
  const gridLineBeats = useMemo(() => {
    return buildTimelineRulerModel({
      visibleTimelineBeats,
      snapGrid,
      timeSignature,
      meterMap,
      tempoMap,
    }).gridLines;
  }, [meterMap, snapGrid, tempoMap, timeSignature, visibleTimelineBeats]);

  const displayBlocks = useMemo(
    () => displayTimelineBlocks({blocks, tracks, liveMidiPreviewByTrack, isRecording, playheadBeat}),
    [blocks, isRecording, liveMidiPreviewByTrack, playheadBeat, tracks],
  );
  const compOutputGroupIds = useMemo(
    () => new Set(
      displayBlocks
        .map(block => block.recordingCompGroupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    ),
    [displayBlocks],
  );
  const displayableBlocks = useMemo(() => {
    return displayBlocks.filter(block => {
      if (!block.recordingTakeGroupId || !compOutputGroupIds.has(block.recordingTakeGroupId)) {
        return true;
      }
      return expandedTakeGroups.includes(block.recordingTakeGroupId);
    });
  }, [compOutputGroupIds, displayBlocks, expandedTakeGroups]);

  const movePlayheadFromTimelineClientX = useCallback((clientX: number) => {
    if (isDraggingBlock) {
      return;
    }
    const rect = timelineSurfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const beat = Math.max(0, Math.min((clientX - rect.left) / pixelsPerBeat, visibleTimelineBeats));
    useDAWStore.getState().setPlayheadBeat(beat, {
      pauseIfPlaying: true,
    });
  }, [isDraggingBlock, pixelsPerBeat, visibleTimelineBeats]);

  const handleRulerPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingBlock) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const beat = Math.max(0, Math.min((event.clientX - rect.left) / pixelsPerBeat, visibleTimelineBeats));
    useDAWStore.getState().setPlayheadBeat(beat, {
      pauseIfPlaying: true,
    });
  };

  const handleTimelineSurfacePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as Element | null;
    if (target?.closest('.ruler-row')) {
      return;
    }
    if (target?.closest('button, input, select, textarea, .marker-chip, .cycle-locator-handle, .playhead-hit-area')) {
      return;
    }
    const rect = timelineSurfaceRef.current?.getBoundingClientRect();
    if (!rect || event.clientY - rect.top > RULER_HEIGHT) {
      return;
    }
    event.stopPropagation();
    movePlayheadFromTimelineClientX(event.clientX);
  };

  const trackIdAtClientY = useCallback((clientY: number): string | null => {
    const rect = timelineSurfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const laneY = clientY - rect.top - RULER_HEIGHT;
    const lane = trackLaneLayout.lanes.find(item =>
      laneY >= item.offsetTop && laneY <= item.offsetTop + item.height,
    );
    return lane?.trackId ?? null;
  }, [trackLaneLayout]);

  const beatAtClientX = useCallback((clientX: number): number | null => {
    const rect = timelineSurfaceRef.current?.getBoundingClientRect();
    if (!rect) {
      return null;
    }
    const rawBeat = Math.max(0, Math.min((clientX - rect.left) / pixelsPerBeat, visibleTimelineBeats));
    return snapBeatToGrid(rawBeat, snapGrid, beatsPerBar);
  }, [beatsPerBar, pixelsPerBeat, snapGrid, visibleTimelineBeats]);

  const handleCopilotDrumPatternDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(COPILOT_DRUM_PATTERN_DRAG_TYPE)) {
      return false;
    }
    event.preventDefault();
    const decoded = decodeCopilotDrumPatternDrag(event.dataTransfer.getData(COPILOT_DRUM_PATTERN_DRAG_TYPE));
    const option = sanitizeCopilotDrumPatternOptions(decoded ? [decoded] : [])[0];
    const trackId = trackIdAtClientY(event.clientY);
    const startBeat = beatAtClientX(event.clientX);
    if (!option || !trackId || startBeat === null) {
      return true;
    }
    stopCopilotDrumPatternPreview();
    const result = importCopilotDrumPatternOption(option, {trackId, startBeat});
    window.dispatchEvent(new CustomEvent('copilot-drum-pattern-imported', {
      detail: {
        optionId: option.id,
        message: result.ok ? result.message : result.error,
        error: result.ok ? undefined : result.error,
      },
    }));
    return true;
  }, [beatAtClientX, trackIdAtClientY]);

  const handleCopilotMidiDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (handleCopilotDrumPatternDrop(event)) {
      return;
    }
    if (!event.dataTransfer.types.includes(COPILOT_MIDI_OPTION_DRAG_TYPE)) {
      return;
    }
    event.preventDefault();
    const decoded = decodeCopilotMidiOptionDrag(event.dataTransfer.getData(COPILOT_MIDI_OPTION_DRAG_TYPE));
    const option = sanitizeCopilotMidiOptions(decoded ? [decoded] : [])[0];
    const trackId = trackIdAtClientY(event.clientY);
    const startBeat = beatAtClientX(event.clientX);
    if (!option || !trackId || startBeat === null) {
      return;
    }
    stopCopilotMidiOptionPreview();
    const result = importCopilotMidiOption(option, {trackId, startBeat});
    window.dispatchEvent(new CustomEvent('copilot-midi-option-imported', {
      detail: {
        optionId: option.id,
        message: result.ok ? result.message : result.error,
        error: result.ok ? undefined : result.error,
      },
    }));
  }, [beatAtClientX, handleCopilotDrumPatternDrop, trackIdAtClientY]);

  const handleCopilotMidiDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (
      event.dataTransfer.types.includes(COPILOT_MIDI_OPTION_DRAG_TYPE) ||
      event.dataTransfer.types.includes(COPILOT_DRUM_PATTERN_DRAG_TYPE)
    ) {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const getTimelineClientX = useCallback(
    () => timelineSurfaceRef.current?.getBoundingClientRect().left ?? 0,
    [],
  );

  const handleAddMarker = useCallback(() => {
    const startBeat = snapBeatToGrid(playheadBeat, snapGrid, beatsPerBar);
    setSections([
      ...sections,
      {
        id: `marker-${Date.now()}`,
        name: `Marker ${sections.length + 1}`,
        startBeat,
        lengthBeats: Math.max(1, beatsPerBar),
      },
    ]);
  }, [beatsPerBar, playheadBeat, sections, setSections, snapGrid]);

  const handleFitProject = useCallback(() => {
    const viewportWidth = horizontalScrollRef.current?.clientWidth ?? 0;
    setPixelsPerBeat(fitTimelinePixelsPerBeat(visibleTimelineBeats, viewportWidth));
    if (horizontalScrollRef.current) {
      horizontalScrollRef.current.scrollLeft = 0;
    }
  }, [visibleTimelineBeats]);

  const handleQuickSwipeComp = useCallback((block: DAWBlock, startBeat: number, endBeat: number) => {
    if (!block.recordingTakeGroupId) {
      return;
    }
    setRecordingCompRange(
      block.recordingTakeGroupId,
      block.recordingTakeId ?? block.id,
      Math.min(startBeat, endBeat),
      Math.max(startBeat, endBeat),
    );
    upsertRecordingCompGroup(useDAWStore.getState().blocks, block.recordingTakeGroupId);
  }, [setRecordingCompRange]);

  const handleSelectCompTake = useCallback((groupId: string, takeId: string) => {
    selectRecordingCompTake(groupId, takeId);
    upsertRecordingCompGroup(useDAWStore.getState().blocks, groupId);
  }, [selectRecordingCompTake]);

  const handleSwitchCompVersion = useCallback((groupId: string, versionId: string) => {
    switchRecordingCompVersion(groupId, versionId);
    upsertRecordingCompGroup(useDAWStore.getState().blocks, groupId);
  }, [switchRecordingCompVersion]);

  const primaryCompOutputId = useCallback((groupId: string): string | null => {
    return blocks
      .filter(block => block.recordingCompGroupId === groupId)
      .sort((left, right) => left.startBeat - right.startBeat)[0]?.id ?? null;
  }, [blocks]);

  const handleTimelineBlockSelect = useCallback((
    block: DAWBlock,
    blockId: string | null,
    options?: {additive?: boolean},
  ) => {
    if (blockId === null) {
      onSelectBlock(null, options);
      return;
    }
    if (block.isRecordingCompDisplayBlock && block.recordingCompGroupId) {
      onSelectBlock(primaryCompOutputId(block.recordingCompGroupId) ?? blockId, options);
      return;
    }
    onSelectBlock(blockId, options);
  }, [onSelectBlock, primaryCompOutputId]);

  const handleTakeFolderModeChange = useCallback((
    groupId: string,
    mode: 'quick-swipe' | 'edit',
  ) => {
    setTakeFolderModes(current => ({...current, [groupId]: mode}));
  }, []);

  const handleFlattenComp = useCallback(async (groupId: string) => {
    setCompRenderError(null);
    setAuditionedRecordingTake(null);
    upsertRecordingCompGroup(useDAWStore.getState().blocks, groupId);
    const result = await flattenRecordingCompGroupInPlace(groupId, getMediaImportBridge());
    if (!result.ok) {
      setCompRenderError(result.error);
      return;
    }
    if (expandedTakeGroups.includes(groupId)) {
      onToggleTakeFolder(groupId);
    }
  }, [expandedTakeGroups, onToggleTakeFolder, setAuditionedRecordingTake]);

  const handleAuditionTake = useCallback((takeId: string | null) => {
    setAuditionedRecordingTake(takeId);
    if (!takeId) {
      return;
    }
    const state = useDAWStore.getState();
    const take = state.blocks.find(block => block.recordingTakeId === takeId || block.id === takeId);
    const groupId = take?.recordingTakeGroupId;
    const range = groupId ? recordingCompFolderRange(state.blocks, groupId) : null;
    if (!range) {
      return;
    }
    state.setCycleRange(range.startBeat, range.endBeat, {enable: true});
    const playheadInsideCycle =
      state.playheadBeat >= range.startBeat &&
      state.playheadBeat < range.endBeat;
    if (!playheadInsideCycle) {
      state.setPlayheadBeat(range.startBeat, {syncTransport: true});
    }
    useDAWStore.getState().setIsPlaying(true);
  }, [setAuditionedRecordingTake]);

  useEffect(() => {
    const autoExpandableGroups = Array.from(new Set(
      blocks
        .map(block => block.recordingTakeGroupId)
        .filter((groupId): groupId is string => Boolean(groupId)),
    )).filter(groupId =>
      compSourceTakeBlocks(blocks, groupId).length >= 3 &&
      !expandedTakeGroups.includes(groupId) &&
      !autoExpandedTakeGroupsRef.current.has(groupId),
    );
    autoExpandableGroups.forEach(groupId => {
      autoExpandedTakeGroupsRef.current.add(groupId);
      onToggleTakeFolder(groupId);
    });
  }, [blocks, expandedTakeGroups, onToggleTakeFolder]);

  useEffect(() => {
    if (!isPlaying && !isRecording) {
      followPlayheadRef.current = true;
    }
  }, [isPlaying, isRecording]);

  useTimelineOriginScroll({horizontalScrollRef, followPlayheadRef, isPlaying, isRecording, playheadBeat});

  const handleHorizontalScroll = useCallback(() => {
    if (!scrollFromFollowRef.current) {
      followPlayheadRef.current = false;
    }
    scrollFromFollowRef.current = false;
  }, []);

  useEffect(() => {
    if (!isPlaying && !isRecording) {
      return;
    }
    if (!followPlayheadRef.current) {
      return;
    }
    const scrollEl = horizontalScrollRef.current;
    if (!scrollEl) {
      return;
    }
    const playheadPx = playheadBeat * pixelsPerBeat;
    const nextLeft = nextTimelineScrollLeft({
      scrollLeft: scrollEl.scrollLeft,
      viewportWidth: scrollEl.clientWidth,
      playheadPx,
    });
    if (nextLeft !== null) {
      scrollFromFollowRef.current = true;
      scrollEl.scrollLeft = nextLeft;
    }
  }, [isPlaying, isRecording, pixelsPerBeat, playheadBeat]);

  return (
    <section className="timeline-container">
      <TimelineToolbar
        snapGrid={snapGrid}
        pixelsPerBeat={pixelsPerBeat}
        rowHeight={rowHeight}
        onAddMarker={handleAddMarker}
        onPixelsPerBeatChange={value => setPixelsPerBeat(clampTimelinePixelsPerBeat(value))}
        onFitProject={handleFitProject}
        onRowHeightChange={value => onRowHeightChange(clampTimelineRowHeight(value))}
        onSnapGridChange={setSnapGrid}
      />
      <div
        className="timeline-horizontal-scroll"
        ref={horizontalScrollRef}
        onScroll={handleHorizontalScroll}>
        <div
          className="timeline-vertical-scroll"
          ref={verticalScrollRef}
          onScroll={onVerticalScroll}
          style={{width: timelineWidth, height: '100%'}}>
          <div
            className="timeline-surface"
            ref={timelineSurfaceRef}
            onDragOver={handleCopilotMidiDragOver}
            onDrop={handleCopilotMidiDrop}
            onPointerDownCapture={handleTimelineSurfacePointerDownCapture}
            style={{width: timelineWidth, height: surfaceHeight}}>
            <TimelineRulerLayer visibleTimelineBeats={visibleTimelineBeats} pixelsPerBeat={pixelsPerBeat} playheadBeat={playheadBeat} snapGrid={snapGrid} timeSignature={timeSignature} meterMap={meterMap} tempoMap={tempoMap} sections={sections} onRulerPointerDown={handleRulerPointerDown} onSectionsChange={setSections} onJumpToBeat={beat => useDAWStore.getState().setPlayheadBeat(beat, {pauseIfPlaying: true})} />
            <div className="timeline-display-rows" aria-hidden="true">
              {displayLaneLayout.lanes.map(lane => (
                <span
                  key={lane.key}
                  className={`timeline-display-row ${lane.kind}`}
                  style={{
                    top: RULER_HEIGHT + lane.offsetTop,
                    width: timelineWidth,
                    height: lane.height,
                  }}
                />
              ))}
            </div>
            <TimelineMarqueeLayer blocks={blocks} trackIds={trackIds} trackLaneLayout={trackLaneLayout} timelineWidth={timelineWidth} pixelsPerBeat={pixelsPerBeat} disabled={isDraggingBlock} onClearSelection={() => onSelectBlock(null)} />
            {gridLineBeats.map(beat => (
              <span
                key={`grid-line-${beat.beat}`}
                className={`grid-line ${beat.kind}`}
                style={{left: beat.beat * pixelsPerBeat}}
              />
            ))}
            <TimelineAutomationLanes tracks={tracks} visibleTimelineBeats={visibleTimelineBeats} pixelsPerBeat={pixelsPerBeat} trackLaneLayout={trackLaneLayout} onPointSet={setTrackAutomationPoint} onPointRemove={removeTrackAutomationPoint} />
            <div className="clips-layer">
              {compRenderError ? (
                <div className="timeline-comp-error" role="status">
                  {compRenderError}
                </div>
              ) : null}
              {displayableBlocks.map(block => {
                const lane = trackLaneMap.get(block.trackId);
                if (!lane) {
                  return null;
                }
                const isGhost = block.id.startsWith('ghost-midi-');
                const isTakeLane = Boolean(
                  block.recordingTakeGroupId && compOutputGroupIds.has(block.recordingTakeGroupId),
                );
                const isCompFolderDisplay = block.isRecordingCompDisplayBlock === true;
                const displayLane = isTakeLane ? takeLaneMap.get(block.id) : lane;
                if (!displayLane) {
                  return null;
                }
                const renderedRowHeight = displayLane.height;
                const isTrackMuted = tracks.find(track => track.id === block.trackId)?.isMuted === true;
                const groupId = block.recordingCompGroupId ?? block.recordingTakeGroupId;
                const versionState = block.recordingCompGroupId
                  ? compVersionState(blocks, block.recordingCompGroupId)
                  : null;
                const takeFolderMode = groupId ? takeFolderModes[groupId] ?? 'quick-swipe' : 'quick-swipe';
                return (
                  <TimelineBlock
                    key={block.id}
                    block={block}
                    blocks={blocks}
                    top={RULER_HEIGHT + displayLane.offsetTop + BLOCK_VERTICAL_PADDING}
                    isSelected={
                      !isGhost &&
                      (
                        selectedBlockId === block.id ||
                        selectedBlockIds.includes(block.id) ||
                        (
                          isCompFolderDisplay &&
                          Boolean(block.recordingCompGroupId) &&
                          blocks.some(item =>
                            item.recordingCompGroupId === block.recordingCompGroupId &&
                            (selectedBlockId === item.id || selectedBlockIds.includes(item.id)),
                          )
                        )
                      )
                    }
                    isTrackMuted={isTrackMuted}
                    trackCount={tracks.length}
                    trackIds={trackIds}
                    maxTimelineBeat={visibleTimelineBeats}
                    pixelsPerBeat={pixelsPerBeat} rowHeight={renderedRowHeight}
                    trackLaneLayout={trackLaneLayout}
                    isGroupSelected={selectedBlockIds.length > 1 && selectedBlockIds.includes(block.id)}
                    snapGrid={snapGrid} isRelativeSnapEnabled={isRelativeSnapEnabled}
                    beatsPerBar={beatsPerBar}
                    onMoveBlock={isGhost || isTakeLane || isCompFolderDisplay ? () => undefined : onMoveBlock}
                    onResizeBlock={isGhost || isTakeLane || isCompFolderDisplay ? () => undefined : onResizeBlock}
                    onSelectBlock={isGhost ? () => undefined : (blockId, options) =>
                      handleTimelineBlockSelect(block, blockId, options)}
                    onUpdateBlock={isGhost ? () => undefined : onUpdateBlock}
                    onDeleteBlock={isGhost || isTakeLane || isCompFolderDisplay ? () => undefined : onDeleteBlock}
                    onDraggingChange={isGhost ? () => undefined : setIsDraggingBlock}
                    readOnly={isGhost || isTakeLane || isCompFolderDisplay}
                    isTakeFolderExpanded={
                      block.recordingCompGroupId
                        ? expandedTakeGroups.includes(block.recordingCompGroupId)
                        : Boolean(block.recordingTakeGroupId && expandedTakeGroups.includes(block.recordingTakeGroupId))
                    }
                    onToggleTakeFolder={onToggleTakeFolder}
                    onQuickSwipeComp={handleQuickSwipeComp}
                    onFlattenComp={handleFlattenComp}
                    quickSwipeMode={takeFolderMode === 'quick-swipe'}
                    takeFolderMode={takeFolderMode}
                    onTakeFolderModeChange={handleTakeFolderModeChange}
                    isAuditioning={
                      Boolean(block.recordingTakeGroupId) &&
                      (block.recordingTakeId ?? block.id) === auditionedRecordingTakeId
                    }
                    onAuditionTake={handleAuditionTake}
                    onSelectCompTake={handleSelectCompTake}
                    compVersions={versionState?.versions}
                    activeCompVersionId={versionState?.activeVersionId}
                    onSwitchCompVersion={handleSwitchCompVersion}
                    onDuplicateCompVersion={duplicateRecordingCompVersion}
                    onRenameCompVersion={renameRecordingCompVersion}
                  />
                );
              })}
              <PlayheadScrubber contentHeight={surfaceHeight} getTimelineClientX={getTimelineClientX} maxTimelineBeat={visibleTimelineBeats} pixelsPerBeat={pixelsPerBeat} />
            </div>
            {tracks.length === 0 ? (
              <div className="timeline-empty">Add a track, arm it, and record to create clips.</div>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
