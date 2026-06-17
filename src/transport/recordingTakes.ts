import {
  blockEndBeat,
  rangesOverlap,
  resolveRecordingOverlapOnBlock,
} from '../music/timelineCollision';
import type {DAWBlock} from '../store/useDAWStore';

const MIN_TAKE_BEATS = 0.0625;

export type RecordingTake = {
  takeId: string;
  blockId: string;
  groupId: string;
  name: string;
  takeIndex: number;
  startBeat: number;
  lengthBeats: number;
  isActive: boolean;
};

export type RecordingTakeGroup = {
  groupId: string;
  trackId: string;
  startBeat: number;
  lengthBeats: number;
  takes: RecordingTake[];
};

export function isRecordingTakeBlock(
  block: Pick<DAWBlock, 'recordingTakeGroupId'>,
): boolean {
  return Boolean(block.recordingTakeGroupId);
}

export function recordingTakeIsActive(
  block: Pick<DAWBlock, 'recordingTakeActive' | 'isMuted'>,
): boolean {
  return typeof block.recordingTakeActive === 'boolean'
    ? block.recordingTakeActive
    : block.isMuted !== true;
}

export function recordingTakeName(block: Pick<DAWBlock, 'recordingTakeIndex'>): string {
  return `Take ${(block.recordingTakeIndex ?? 0) + 1}`;
}

function takeGroupIdFor(block: DAWBlock): string {
  return block.recordingTakeGroupId ?? `take:${block.trackId}:${block.id}`;
}

function takeIndexFor(blocks: DAWBlock[], groupId: string): number {
  return blocks.reduce((nextIndex, block) => {
    if (block.recordingTakeGroupId !== groupId) {
      return nextIndex;
    }
    return Math.max(nextIndex, (block.recordingTakeIndex ?? 0) + 1);
  }, 0);
}

function overlapsRecordingTake(block: DAWBlock, recording: DAWBlock): boolean {
  return block.trackId === recording.trackId
    && block.id !== recording.id
    && isRecordingTakeBlock(block)
    && rangesOverlap(
      block.startBeat,
      blockEndBeat(block),
      recording.startBeat,
      blockEndBeat(recording),
    );
}

function takeBlock(block: DAWBlock, groupId: string, takeIndex: number): DAWBlock {
  const next = {
    ...block,
    recordingTakeGroupId: groupId,
    recordingTakeId: block.recordingTakeId ?? block.id,
    recordingTakeIndex: takeIndex,
    recordingTakeActive: true,
  };
  delete next.isMuted;
  return next;
}

/**
 * New linear recordings become non-destructive takes only when they overlap a prior
 * recording take. Older non-take clips keep the existing destructive punch behavior.
 */
export function blocksWithFinalizedRecordingTake(
  blocks: DAWBlock[],
  recordingBlockId: string,
): DAWBlock[] {
  const recording = blocks.find(block => block.id === recordingBlockId);
  if (!recording) {
    return blocks;
  }

  const overlappingTake = blocks.find(block => overlapsRecordingTake(block, recording));
  const groupId = overlappingTake ? takeGroupIdFor(overlappingTake) : takeGroupIdFor(recording);
  const takeIndex = takeIndexFor(blocks, groupId);
  const recStart = recording.startBeat;
  const recEnd = blockEndBeat(recording);
  const protectedIds = new Set(
    blocks
      .filter(block => block.recordingTakeGroupId === groupId)
      .map(block => block.id),
  );
  protectedIds.add(recordingBlockId);

  const result: DAWBlock[] = [];
  for (const block of blocks) {
    if (block.id === recordingBlockId) {
      result.push(takeBlock(block, groupId, takeIndex));
      continue;
    }

    if (protectedIds.has(block.id)) {
      const next = {...block, recordingTakeActive: false};
      delete next.isMuted;
      result.push(next);
      continue;
    }

    if (block.trackId !== recording.trackId) {
      result.push(block);
      continue;
    }

    result.push(...resolveRecordingOverlapOnBlock(block, recStart, recEnd));
  }

  return result;
}

export function blocksAfterRecordingTakeComp(blocks: DAWBlock[], takeId: string): DAWBlock[] {
  const active = blocks.find(
    block => block.recordingTakeId === takeId || block.id === takeId,
  );
  if (!active?.recordingTakeGroupId) {
    return blocks;
  }

  return blocks.map(block => {
    if (block.recordingTakeGroupId !== active.recordingTakeGroupId) {
      return block;
    }
    if ((block.recordingTakeId ?? block.id) === (active.recordingTakeId ?? active.id)) {
      const next = {...block};
      next.recordingTakeActive = true;
      delete next.isMuted;
      return next;
    }
    const next = {...block, recordingTakeActive: false};
    delete next.isMuted;
    return next;
  });
}

export function recordingTakeGroups(blocks: DAWBlock[]): RecordingTakeGroup[] {
  const groups = new Map<string, DAWBlock[]>();
  blocks.forEach(block => {
    if (!block.recordingTakeGroupId) {
      return;
    }
    const items = groups.get(block.recordingTakeGroupId) ?? [];
    items.push(block);
    groups.set(block.recordingTakeGroupId, items);
  });

  return [...groups.entries()]
    .map(([groupId, items]) => {
      const sorted = [...items].sort(
        (left, right) => (left.recordingTakeIndex ?? 0) - (right.recordingTakeIndex ?? 0),
      );
      const startBeat = Math.min(...sorted.map(block => block.startBeat));
      const endBeat = Math.max(...sorted.map(block => blockEndBeat(block)));
      return {
        groupId,
        trackId: sorted[0]!.trackId,
        startBeat,
        lengthBeats: Math.max(MIN_TAKE_BEATS, endBeat - startBeat),
        takes: sorted.map(block => ({
          takeId: block.recordingTakeId ?? block.id,
          blockId: block.id,
          groupId,
          name: recordingTakeName(block),
          takeIndex: block.recordingTakeIndex ?? 0,
          startBeat: block.startBeat,
          lengthBeats: block.lengthBeats,
          isActive: recordingTakeIsActive(block),
        })),
      };
    })
    .filter(group => group.takes.length > 1)
    .sort((left, right) => left.trackId.localeCompare(right.trackId) || left.startBeat - right.startBeat);
}
