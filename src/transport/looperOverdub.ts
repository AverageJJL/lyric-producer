import type {TimeSignature} from '../store/projectMetadata';
import type {DAWBlock, DAWNote} from '../store/useDAWStore';
import {
  looperLengthBeats,
  normalizeLooperLengthBars,
  normalizePerformanceMode,
  type LooperLengthBars,
  type ProjectPerformanceMode,
} from './performanceMode';

const MIN_SEGMENT_BEATS = 0.0625;

type LooperRecordingState = {
  blocks: DAWBlock[];
  performanceMode?: ProjectPerformanceMode;
  looperLengthBars?: LooperLengthBars;
  timeSignature?: TimeSignature;
};

export type LooperCompLayer = {
  layerId: string;
  trackId: string;
  name: string;
  layerIndex: number;
  segmentCount: number;
  startBeat: number;
  lengthBeats: number;
  isActive: boolean;
};

export function isLooperOverdubBlock(
  block: Pick<DAWBlock, 'looperLayerId'>,
): boolean {
  return typeof block.looperLayerId === 'string' && block.looperLayerId.length > 0;
}

export function looperOverdubName(
  block: Pick<DAWBlock, 'looperLayerIndex'>,
): string {
  return `Overdub ${(block.looperLayerIndex ?? 0) + 1}`;
}

export function looperRecordingStatusLabel(
  block: Pick<DAWBlock, 'looperLayerIndex'>,
): string {
  return `Looper overdub ${(block.looperLayerIndex ?? 0) + 1}`;
}

export function looperLayerCount(blocks: DAWBlock[]): number {
  const layerIds = new Set<string>();
  blocks.forEach(block => {
    if (isLooperOverdubBlock(block)) {
      layerIds.add(block.looperLayerId!);
    }
  });
  return layerIds.size;
}

export function looperCompLayers(blocks: DAWBlock[]): LooperCompLayer[] {
  const groups = new Map<string, DAWBlock[]>();
  blocks.forEach(block => {
    if (!isLooperOverdubBlock(block)) {
      return;
    }
    const items = groups.get(block.looperLayerId!) ?? [];
    items.push(block);
    groups.set(block.looperLayerId!, items);
  });

  return [...groups.entries()]
    .map(([layerId, items]) => {
      const first = items[0]!;
      const endBeat = Math.max(...items.map(block => block.startBeat + block.lengthBeats));
      const startBeat = Math.min(...items.map(block => block.startBeat));
      return {
        layerId,
        trackId: first.trackId,
        name: looperOverdubName(first),
        layerIndex: first.looperLayerIndex ?? 0,
        segmentCount: items.length,
        startBeat,
        lengthBeats: Math.max(MIN_SEGMENT_BEATS, endBeat - startBeat),
        isActive: items.every(block => block.isMuted !== true),
      };
    })
    .sort((left, right) =>
      left.trackId.localeCompare(right.trackId) || left.layerIndex - right.layerIndex,
    );
}

function blockWithMute(block: DAWBlock, isMuted: boolean): DAWBlock {
  if (isMuted) {
    return {...block, isMuted: true};
  }
  const next = {...block};
  delete next.isMuted;
  return next;
}

export function blocksAfterLooperComp(
  blocks: DAWBlock[],
  activeLayerId: string,
): DAWBlock[] {
  const active = blocks.find(
    block => isLooperOverdubBlock(block) && block.looperLayerId === activeLayerId,
  );
  if (!active) {
    return blocks;
  }

  return blocks.map(block => {
    if (!isLooperOverdubBlock(block) || block.trackId !== active.trackId) {
      return block;
    }
    return blockWithMute(block, block.looperLayerId !== activeLayerId);
  });
}

function looperLayerId(trackId: string, layerIndex: number): string {
  return `looper:${trackId}:${layerIndex}`;
}

function nextLooperLayerIndex(blocks: DAWBlock[], trackId: string): number {
  return blocks.reduce((nextIndex, block) => {
    if (block.trackId !== trackId || !isLooperOverdubBlock(block)) {
      return nextIndex;
    }
    return Math.max(nextIndex, (block.looperLayerIndex ?? 0) + 1);
  }, 0);
}

function normalizeLooperBeat(beat: number, loopLengthBeats: number): number {
  if (!Number.isFinite(beat) || loopLengthBeats <= 0) {
    return 0;
  }
  const wrapped = Math.max(0, beat) % loopLengthBeats;
  return Number(wrapped.toFixed(6));
}

function visibleLoopLength(block: DAWBlock, loopLength: number): number {
  return Math.max(MIN_SEGMENT_BEATS, Math.min(block.lengthBeats, loopLength));
}

export function prepareLooperRecordingBlock(
  block: DAWBlock,
  state: LooperRecordingState,
): DAWBlock {
  if (normalizePerformanceMode(state.performanceMode) !== 'looper') {
    return block;
  }

  const loopLength = looperLengthBeats(
    normalizeLooperLengthBars(state.looperLengthBars),
    state.timeSignature,
  );
  const layerIndex = nextLooperLayerIndex(state.blocks, block.trackId);
  return {
    ...block,
    startBeat: normalizeLooperBeat(block.startBeat, loopLength),
    looperLayerId: looperLayerId(block.trackId, layerIndex),
    looperLayerIndex: layerIndex,
    looperBaseStartBeat: 0,
    looperLengthBeats: loopLength,
  };
}

function sourceRangeNotes(
  notes: DAWNote[] | undefined,
  rangeStart: number,
  rangeLength: number,
): DAWNote[] | undefined {
  if (!notes) {
    return undefined;
  }

  const rangeEnd = rangeStart + rangeLength;
  return notes.flatMap(note => {
    const noteStart = note.startBeat;
    const noteEnd = note.startBeat + note.lengthBeats;
    const start = Math.max(noteStart, rangeStart);
    const end = Math.min(noteEnd, rangeEnd);
    if (end - start < MIN_SEGMENT_BEATS) {
      return [];
    }
    return [{
      ...note,
      startBeat: Number((start - rangeStart).toFixed(6)),
      lengthBeats: Number((end - start).toFixed(6)),
    }];
  });
}

function looperSegment(
  block: DAWBlock,
  id: string,
  startBeat: number,
  lengthBeats: number,
  sourceOffsetBeats: number,
): DAWBlock {
  const audioOffset =
    block.type === 'audio'
      ? (block.sourceOffsetBeats ?? 0) + sourceOffsetBeats
      : undefined;
  return {
    ...block,
    id,
    startBeat,
    lengthBeats,
    sourceOffsetBeats: audioOffset,
    notes: block.type === 'midi'
      ? sourceRangeNotes(block.notes, sourceOffsetBeats, lengthBeats)
      : block.notes,
  };
}

export function finalizedLooperOverdubSegments(block: DAWBlock): DAWBlock[] {
  if (!isLooperOverdubBlock(block)) {
    return [block];
  }

  const loopLength = Math.max(MIN_SEGMENT_BEATS, block.looperLengthBeats ?? block.lengthBeats);
  const startBeat = normalizeLooperBeat(block.startBeat, loopLength);
  const lengthBeats = visibleLoopLength(block, loopLength);
  const remainingInLoop = Math.max(MIN_SEGMENT_BEATS, loopLength - startBeat);
  const headLength = Math.min(lengthBeats, remainingInLoop);
  const tailLength = lengthBeats - headLength;
  const head = looperSegment(block, block.id, startBeat, headLength, 0);

  if (tailLength < MIN_SEGMENT_BEATS) {
    return [head];
  }

  const tail = looperSegment(
    block,
    `${block.id}-wrap`,
    block.looperBaseStartBeat ?? 0,
    tailLength,
    headLength,
  );
  return block.type === 'midi' && (tail.notes?.length ?? 0) === 0
    ? [head]
    : [head, tail];
}
