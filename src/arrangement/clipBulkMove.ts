import {blockEndBeat, rangesOverlap} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {computeVisibleTimelineBeats} from '../ui/timelineExtent';

type GroupMoveInput = {
  blocks: DAWBlock[];
  trackIds: string[];
  selectedBlockIds: string[];
  anchorBlockId: string;
  targetStartBeat: number;
  targetTrackId: string;
  maxTimelineBeat: number;
};

type MoveCandidate = {
  block: DAWBlock;
  trackId: string;
  startBeat: number;
  endBeat: number;
};

type MoveSearchContext = {
  trackIndexById: Map<string, number>;
  unselectedByTrack: Map<string, DAWBlock[]>;
};

const EPSILON = 1e-6;

function cleanBeat(value: number): number {
  return Number(value.toFixed(6));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function uniqueSelectedBlocks(input: GroupMoveInput): DAWBlock[] {
  const selectedIds = new Set(input.selectedBlockIds);
  if (!selectedIds.has(input.anchorBlockId) || selectedIds.size < 2) {
    return [];
  }
  return input.blocks.filter(block => selectedIds.has(block.id));
}

function moveSearchContext(input: GroupMoveInput): MoveSearchContext {
  const selectedIds = new Set(input.selectedBlockIds);
  const trackIndexById = new Map(input.trackIds.map((trackId, index) => [trackId, index]));
  const unselectedByTrack = new Map<string, DAWBlock[]>();

  input.blocks.forEach(block => {
    if (selectedIds.has(block.id)) {
      return;
    }
    const blocks = unselectedByTrack.get(block.trackId);
    if (blocks) {
      blocks.push(block);
    } else {
      unselectedByTrack.set(block.trackId, [block]);
    }
  });

  return {trackIndexById, unselectedByTrack};
}

function trackDeltaForGroup(
  selected: DAWBlock[],
  anchor: DAWBlock,
  input: GroupMoveInput,
  context: MoveSearchContext,
): number {
  const anchorTrackIndex = context.trackIndexById.get(anchor.trackId) ?? -1;
  const targetTrackIndex = context.trackIndexById.get(input.targetTrackId) ?? -1;
  if (anchorTrackIndex < 0 || targetTrackIndex < 0) {
    return 0;
  }

  const desiredDelta = targetTrackIndex - anchorTrackIndex;
  const selectedIndexes = selected.map(block => context.trackIndexById.get(block.trackId) ?? -1);
  const minIndex = Math.min(...selectedIndexes);
  const maxIndex = Math.max(...selectedIndexes);
  return clamp(desiredDelta, -minIndex, input.trackIds.length - 1 - maxIndex);
}

function beatDeltaBounds(
  selected: DAWBlock[],
  maxTimelineBeat: number,
): {min: number; max: number} {
  return selected.reduce(
    (bounds, block) => ({
      min: Math.max(bounds.min, -block.startBeat),
      max: Math.min(bounds.max, maxTimelineBeat - blockEndBeat(block)),
    }),
    {min: Number.NEGATIVE_INFINITY, max: Number.POSITIVE_INFINITY},
  );
}

function candidatesForDelta(
  selected: DAWBlock[],
  trackIds: string[],
  context: MoveSearchContext,
  trackDelta: number,
  beatDelta: number,
): MoveCandidate[] {
  return selected.map(block => {
    const trackIndex = context.trackIndexById.get(block.trackId) ?? -1;
    const nextTrackId = trackIds[trackIndex + trackDelta] ?? block.trackId;
    const startBeat = cleanBeat(block.startBeat + beatDelta);
    return {
      block,
      trackId: nextTrackId,
      startBeat,
      endBeat: startBeat + block.lengthBeats,
    };
  });
}

function hasCollision(candidates: MoveCandidate[], context: MoveSearchContext): boolean {
  return candidates.some(candidate =>
    (context.unselectedByTrack.get(candidate.trackId) ?? []).some(block =>
      rangesOverlap(candidate.startBeat, candidate.endBeat, block.startBeat, blockEndBeat(block)),
    ),
  );
}

function deltaOptions(
  selected: DAWBlock[],
  trackIds: string[],
  trackDelta: number,
  input: GroupMoveInput,
  context: MoveSearchContext,
  bounds: {min: number; max: number},
): number[] {
  const options = [bounds.min, bounds.max];

  selected.forEach(block => {
    const trackIndex = context.trackIndexById.get(block.trackId) ?? -1;
    const nextTrackId = trackIds[trackIndex + trackDelta] ?? block.trackId;
    (context.unselectedByTrack.get(nextTrackId) ?? []).forEach(other => {
      options.push(other.startBeat - block.lengthBeats - block.startBeat);
      options.push(blockEndBeat(other) - block.startBeat);
    });
  });

  return [...new Set(options.map(value => cleanBeat(clamp(value, bounds.min, bounds.max))))];
}

function bestBeatDelta(
  selected: DAWBlock[],
  anchor: DAWBlock,
  trackDelta: number,
  input: GroupMoveInput,
  context: MoveSearchContext,
): number | null {
  const bounds = beatDeltaBounds(selected, input.maxTimelineBeat);
  const desired = cleanBeat(clamp(input.targetStartBeat - anchor.startBeat, bounds.min, bounds.max));
  const desiredCandidates = candidatesForDelta(selected, input.trackIds, context, trackDelta, desired);
  if (!hasCollision(desiredCandidates, context)) {
    return desired;
  }

  return deltaOptions(selected, input.trackIds, trackDelta, input, context, bounds)
    .filter(delta =>
      !hasCollision(
        candidatesForDelta(selected, input.trackIds, context, trackDelta, delta),
        context,
      ))
    .sort((left, right) =>
      Math.abs(left - desired) - Math.abs(right - desired) || left - right,
    )[0] ?? null;
}

export function blocksAfterSelectedClipMove(input: GroupMoveInput): DAWBlock[] | null {
  const selected = uniqueSelectedBlocks(input);
  const anchor = selected.find(block => block.id === input.anchorBlockId);
  if (!anchor || input.trackIds.length === 0) {
    return null;
  }

  const context = moveSearchContext(input);
  const trackDelta = trackDeltaForGroup(selected, anchor, input, context);
  const beatDelta = bestBeatDelta(selected, anchor, trackDelta, input, context);
  if (beatDelta === null || (Math.abs(beatDelta) < EPSILON && trackDelta === 0)) {
    return null;
  }

  const byId = new Map(
    candidatesForDelta(selected, input.trackIds, context, trackDelta, beatDelta).map(candidate => [
      candidate.block.id,
      {...candidate.block, trackId: candidate.trackId, startBeat: candidate.startBeat},
    ]),
  );

  return input.blocks.map(block => byId.get(block.id) ?? block);
}

export function moveSelectedClipsAsGroup(
  anchorBlockId: string,
  targetStartBeat: number,
  targetTrackId: string,
): boolean {
  const state = useDAWStore.getState();
  const nextBlocks = blocksAfterSelectedClipMove({
    blocks: state.blocks,
    trackIds: state.tracks.map(track => track.id),
    selectedBlockIds: state.selectedBlockIds,
    anchorBlockId,
    targetStartBeat,
    targetTrackId,
    maxTimelineBeat: computeVisibleTimelineBeats({
      blocks: state.blocks,
      playheadBeat: state.playheadBeat,
      recordingBlockId: state.recordingBlockId,
    }),
  });

  if (!nextBlocks) {
    return false;
  }

  const anchorTrackId =
    nextBlocks.find(block => block.id === anchorBlockId)?.trackId ?? targetTrackId;
  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState({
    blocks: nextBlocks,
    selectedBlockId: anchorBlockId,
    selectedBlockIds: state.selectedBlockIds,
    selectedTrackId: anchorTrackId,
    syncSource: 'ui',
  });
  return true;
}
