import {blockEndBeat, rangesOverlap} from '../music/timelineCollision';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';

export type MarqueeSelectionBounds = {
  startBeat: number;
  endBeat: number;
  startRow: number;
  endRow: number;
};

function normalizedBounds(bounds: MarqueeSelectionBounds): MarqueeSelectionBounds {
  return {
    startBeat: Math.min(bounds.startBeat, bounds.endBeat),
    endBeat: Math.max(bounds.startBeat, bounds.endBeat),
    startRow: Math.min(bounds.startRow, bounds.endRow),
    endRow: Math.max(bounds.startRow, bounds.endRow),
  };
}

export function clipIdsInMarquee(
  blocks: DAWBlock[],
  trackIds: string[],
  bounds: MarqueeSelectionBounds,
): string[] {
  const normalized = normalizedBounds(bounds);
  return blocks
    .filter(block => {
      const rowIndex = trackIds.indexOf(block.trackId);
      return rowIndex >= normalized.startRow &&
        rowIndex <= normalized.endRow &&
        rangesOverlap(
          normalized.startBeat,
          normalized.endBeat,
          block.startBeat,
          blockEndBeat(block),
        );
    })
    .map(block => block.id);
}

export function commitMarqueeClipSelection(blockIds: string[], additive = false): void {
  const state = useDAWStore.getState();
  const validIds = new Set(state.blocks.map(block => block.id));
  const existing = additive ? state.selectedBlockIds.filter(id => validIds.has(id)) : [];
  const selectedBlockIds = [
    ...new Set([...existing, ...blockIds.filter(id => validIds.has(id))]),
  ];
  const selectedBlockId = selectedBlockIds[selectedBlockIds.length - 1] ?? null;
  const selectedBlock = selectedBlockId
    ? state.blocks.find(block => block.id === selectedBlockId)
    : null;

  useDAWStore.setState({
    selectedBlockId,
    selectedBlockIds,
    selectedTrackId: selectedBlock?.trackId ?? state.selectedTrackId,
    syncSource: 'ui',
  });
}
