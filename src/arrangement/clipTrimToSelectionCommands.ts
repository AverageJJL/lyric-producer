import {isDrumPatternBlock} from '../music/clipFactories';
import {blockEndBeat} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock, type DAWNote} from '../store/useDAWStore';
import {normalizeCycleRange} from '../transport/cycleRange';

function cloneNote(note: DAWNote): DAWNote {
  return {...note};
}

function cloneBlock(block: DAWBlock): DAWBlock {
  return {
    ...block,
    notes: block.notes ? block.notes.map(cloneNote) : undefined,
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

function selectedClipIds(
  selectedBlockIds: string[],
  selectedBlockId: string | null,
  blocks: DAWBlock[],
): string[] {
  const blockIds = new Set(blocks.map(block => block.id));
  const ids = selectedBlockIds.length > 0
    ? selectedBlockIds
    : selectedBlockId ? [selectedBlockId] : [];
  return [...new Set(ids)].filter(id => blockIds.has(id));
}

function trimNotesToAbsoluteRange(
  block: DAWBlock,
  rangeStartBeat: number,
  rangeEndBeat: number,
): DAWNote[] | undefined {
  if (!block.notes) {
    return undefined;
  }

  return block.notes.flatMap(note => {
    const noteStart = block.startBeat + note.startBeat;
    const noteEnd = noteStart + note.lengthBeats;
    const trimmedStart = Math.max(noteStart, rangeStartBeat);
    const trimmedEnd = Math.min(noteEnd, rangeEndBeat);
    if (trimmedStart >= trimmedEnd) {
      return [];
    }

    return [{
      ...note,
      startBeat: trimmedStart - rangeStartBeat,
      lengthBeats: trimmedEnd - trimmedStart,
    }];
  });
}

function trimBlockToRange(
  block: DAWBlock,
  rangeStartBeat: number,
  rangeEndBeat: number,
): DAWBlock | null {
  if (isDrumPatternBlock(block)) {
    return null;
  }

  const sourceEnd = blockEndBeat(block);
  const nextStart = Math.max(block.startBeat, rangeStartBeat);
  const nextEnd = Math.min(sourceEnd, rangeEndBeat);
  if (nextStart >= nextEnd || (nextStart === block.startBeat && nextEnd === sourceEnd)) {
    return null;
  }

  const startDelta = nextStart - block.startBeat;
  return {
    ...cloneBlock(block),
    startBeat: nextStart,
    lengthBeats: nextEnd - nextStart,
    notes: trimNotesToAbsoluteRange(block, nextStart, nextEnd),
    sourceOffsetBeats:
      block.type === 'audio' && block.sourceOffsetBeats !== undefined
        ? block.sourceOffsetBeats + startDelta
        : block.sourceOffsetBeats,
  };
}

export function trimSelectedClipsToCycleRange(): boolean {
  const state = useDAWStore.getState();
  if (!state.isCycleEnabled) {
    return false;
  }

  const range = normalizeCycleRange(state.cycleStartBeat, state.cycleEndBeat);
  const selectedIds = selectedClipIds(state.selectedBlockIds, state.selectedBlockId, state.blocks);
  if (selectedIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedIds);
  const updates = new Map<string, DAWBlock>();
  state.blocks.forEach(block => {
    if (!selected.has(block.id)) {
      return;
    }

    const nextBlock = trimBlockToRange(block, range.startBeat, range.endBeat);
    if (nextBlock) {
      updates.set(block.id, nextBlock);
    }
  });
  if (updates.size === 0) {
    return false;
  }

  const nextSelectedBlockId = selectedIds.includes(state.selectedBlockId ?? '')
    ? state.selectedBlockId
    : selectedIds[selectedIds.length - 1] ?? null;
  const selectedBlock = nextSelectedBlockId
    ? updates.get(nextSelectedBlockId) ?? state.blocks.find(block => block.id === nextSelectedBlockId)
    : null;

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(block => updates.get(block.id) ?? block),
    selectedBlockId: nextSelectedBlockId,
    selectedBlockIds: selectedIds,
    selectedTrackId: selectedBlock?.trackId ?? current.selectedTrackId,
    syncSource: 'ui',
  }));
  return true;
}
