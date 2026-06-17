import {clipLengthFromNoteExtent, noteExtentBeats} from './midiClipNormalization';
import type {DAWBlock, DAWNote} from '../store/useDAWStore';

const MIN_CLIP_BEATS = 1;

export type BlockTimeRange = {
  id: string;
  trackId: string;
  startBeat: number;
  endBeat: number;
};

export function blockEndBeat(block: Pick<DAWBlock, 'startBeat' | 'lengthBeats'>): number {
  return block.startBeat + block.lengthBeats;
}

export function rangesOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function blocksOnTrack(blocks: DAWBlock[], trackId: string, excludeId?: string): DAWBlock[] {
  return blocks.filter(block => block.trackId === trackId && block.id !== excludeId);
}

function capTimelineStart(startBeat: number, lengthBeats: number, maxTimelineBeat: number): number {
  return Math.max(0, Math.min(startBeat, maxTimelineBeat - lengthBeats));
}

function moveOverlapsOthers(
  startBeat: number,
  lengthBeats: number,
  others: DAWBlock[],
): boolean {
  const end = startBeat + lengthBeats;
  return others.some(other => rangesOverlap(startBeat, end, other.startBeat, blockEndBeat(other)));
}

/**
 * Clamp move so [start, end] does not overlap other blocks on the same track.
 * Snaps to the nearer side (left or right) of obstructing clips.
 */
export function clampMoveStartBeat(
  blocks: DAWBlock[],
  blockId: string,
  trackId: string,
  lengthBeats: number,
  desiredStart: number,
  maxTimelineBeat: number,
): number {
  const others = blocksOnTrack(blocks, trackId, blockId);
  const cap = (value: number) => capTimelineStart(value, lengthBeats, maxTimelineBeat);
  const desired = cap(desiredStart);

  if (!moveOverlapsOthers(desired, lengthBeats, others)) {
    return desired;
  }

  let best = desired;
  let bestDistance = Number.POSITIVE_INFINITY;

  const consider = (candidate: number) => {
    const capped = cap(candidate);
    if (!moveOverlapsOthers(capped, lengthBeats, others)) {
      const distance = Math.abs(capped - desiredStart);
      if (distance < bestDistance) {
        best = capped;
        bestDistance = distance;
      }
    }
  };

  for (const other of others) {
    consider(blockEndBeat(other));
    consider(other.startBeat - lengthBeats);
  }

  if (!moveOverlapsOthers(best, lengthBeats, others)) {
    return best;
  }

  // No slot fits at full length — hug the nearest wall to the pointer.
  for (const other of others) {
    const otherEnd = blockEndBeat(other);
    const pushRight = cap(otherEnd);
    const pushLeft = cap(other.startBeat - lengthBeats);
    const rightDistance = Math.abs(pushRight - desiredStart);
    const leftDistance = Math.abs(pushLeft - desiredStart);
    const forced = rightDistance <= leftDistance ? pushRight : pushLeft;
    const distance = Math.min(rightDistance, leftDistance);
    if (distance < bestDistance) {
      best = forced;
      bestDistance = distance;
    }
  }

  return cap(best);
}

/** Clamp resize-left with a fixed right edge (end beat). */
export function clampResizeFromLeft(
  blocks: DAWBlock[],
  blockId: string,
  trackId: string,
  desiredStart: number,
  fixedEndBeat: number,
): {startBeat: number; lengthBeats: number} {
  const minLength = 1;
  const others = blocksOnTrack(blocks, trackId, blockId);
  let startBeat = Math.max(0, Math.min(desiredStart, fixedEndBeat - minLength));

  for (let pass = 0; pass < others.length + 2; pass += 1) {
    let changed = false;

    for (const other of others) {
      const otherEnd = blockEndBeat(other);
      if (!rangesOverlap(startBeat, fixedEndBeat, other.startBeat, otherEnd)) {
        continue;
      }

      const nextStart = Math.max(startBeat, otherEnd);
      if (nextStart !== startBeat) {
        startBeat = nextStart;
        changed = true;
      }
    }

    if (!changed) {
      break;
    }
  }

  const lengthBeats = Math.max(minLength, fixedEndBeat - startBeat);
  return {startBeat, lengthBeats};
}

/** Clamp resize-right with a fixed start beat. */
export function clampResizeFromRight(
  blocks: DAWBlock[],
  blockId: string,
  trackId: string,
  startBeat: number,
  desiredLength: number,
  maxTimelineBeat: number,
): number {
  const minLength = 1;
  let lengthBeats = Math.max(minLength, desiredLength);
  const others = blocksOnTrack(blocks, trackId, blockId);

  for (let pass = 0; pass < others.length + 2; pass += 1) {
    const end = startBeat + lengthBeats;
    let changed = false;

    for (const other of others) {
      const otherEnd = blockEndBeat(other);
      if (!rangesOverlap(startBeat, end, other.startBeat, otherEnd)) {
        continue;
      }

      if (other.startBeat >= startBeat) {
        const capped = Math.max(minLength, other.startBeat - startBeat);
        if (capped < lengthBeats) {
          lengthBeats = capped;
          changed = true;
        }
      }
    }

    if (!changed) {
      break;
    }
  }

  return Math.min(lengthBeats, maxTimelineBeat - startBeat);
}

/** Max visible length for audio trim windows during resize preview. */
export function maxAudioVisibleLength(block: DAWBlock): number | null {
  if (block.type !== 'audio' || block.sourceLengthBeats === undefined) {
    return null;
  }
  const offset = block.sourceOffsetBeats ?? 0;
  return block.sourceLengthBeats - offset;
}

export function clampAudioResizeFromRight(
  blocks: DAWBlock[],
  block: DAWBlock,
  desiredLength: number,
  maxTimelineBeat: number,
): number {
  const sourceCap = maxAudioVisibleLength(block);
  const cappedBySource = sourceCap === null ? desiredLength : Math.min(desiredLength, sourceCap);
  return clampResizeFromRight(blocks, block.id, block.trackId, block.startBeat, cappedBySource, maxTimelineBeat);
}

export function clampAudioResizeFromLeft(
  blocks: DAWBlock[],
  block: DAWBlock,
  desiredStart: number,
  fixedEndBeat: number,
): {startBeat: number; lengthBeats: number} {
  const clamped = clampResizeFromLeft(blocks, block.id, block.trackId, desiredStart, fixedEndBeat);
  const sourceCap = maxAudioVisibleLength(block);
  if (sourceCap === null) {
    return clamped;
  }

  const delta = clamped.startBeat - block.startBeat;
  const maxVisibleAfter = sourceCap - delta;
  const lengthBeats = Math.min(clamped.lengthBeats, Math.max(1, maxVisibleAfter));
  return {startBeat: clamped.startBeat, lengthBeats};
}

/** Final recorded span for overlap — MIDI uses note extent, not inflated UI growth. */
export function recordingClipLengthBeats(block: DAWBlock, notes: DAWNote[]): number {
  if (block.type !== 'midi') {
    return Math.max(MIN_CLIP_BEATS, block.lengthBeats);
  }

  if (notes.length === 0) {
    return MIN_CLIP_BEATS;
  }

  const noteEnd = noteExtentBeats(notes);
  return Math.max(MIN_CLIP_BEATS, clipLengthFromNoteExtent(noteEnd, {minBeats: MIN_CLIP_BEATS}));
}

/**
 * Apply one existing clip against the final recorded range on the same track.
 * Returns zero (delete), one (trim), or two (split) blocks.
 */
export function resolveRecordingOverlapOnBlock(
  block: DAWBlock,
  recStart: number,
  recEnd: number,
): DAWBlock[] {
  const blockStart = block.startBeat;
  const blockEnd = blockEndBeat(block);

  if (!rangesOverlap(recStart, recEnd, blockStart, blockEnd)) {
    return [block];
  }

  if (recStart <= blockStart && recEnd >= blockEnd) {
    return [];
  }

  const pieces: DAWBlock[] = [];

  const headLength = recStart - blockStart;
  if (headLength >= MIN_CLIP_BEATS && recStart > blockStart) {
    pieces.push({...block, lengthBeats: headLength});
  }

  const tailStart = recEnd;
  const tailLength = blockEnd - tailStart;
  if (tailLength >= MIN_CLIP_BEATS && recEnd < blockEnd) {
    pieces.push({
      ...block,
      id: `${block.id}-tail-${tailStart}`,
      startBeat: tailStart,
      lengthBeats: tailLength,
    });
  }

  return pieces;
}

/**
 * Trim, split, or remove existing clips on the same track overlapped by a pasted clip.
 */
export function resolvePasteOverlaps(blocks: DAWBlock[], pastedBlock: DAWBlock): DAWBlock[] {
  const pasteStart = pastedBlock.startBeat;
  const pasteEnd = blockEndBeat(pastedBlock);
  const result: DAWBlock[] = [];

  for (const block of blocks) {
    if (block.trackId !== pastedBlock.trackId) {
      result.push(block);
      continue;
    }

    result.push(...resolveRecordingOverlapOnBlock(block, pasteStart, pasteEnd));
  }

  result.push(pastedBlock);
  return result;
}

/**
 * After recording stops, trim or remove older blocks overlapped by the final take only.
 */
export function resolveRecordingOverlaps(blocks: DAWBlock[], recordingBlockId: string): DAWBlock[] {
  const recording = blocks.find(block => block.id === recordingBlockId);
  if (!recording) {
    return blocks;
  }

  const recStart = recording.startBeat;
  const recEnd = blockEndBeat(recording);
  const result: DAWBlock[] = [];

  for (const block of blocks) {
    if (block.id === recordingBlockId) {
      result.push(recording);
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
