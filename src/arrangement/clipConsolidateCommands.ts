import {blockEndBeat} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock, type DAWNote} from '../store/useDAWStore';

let consolidateSequence = 0;

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

function nextConsolidatedId(sourceId: string): string {
  consolidateSequence += 1;
  return `${sourceId}-consolidated-${Date.now()}-${consolidateSequence}`;
}

function selectedBlocks(): DAWBlock[] {
  const state = useDAWStore.getState();
  const selectedIds = [
    ...new Set(state.selectedBlockIds.length > 0
      ? state.selectedBlockIds
      : state.selectedBlockId ? [state.selectedBlockId] : []),
  ];
  return selectedIds
    .map(id => state.blocks.find(block => block.id === id))
    .filter((block): block is DAWBlock => Boolean(block));
}

export function consolidateSelectedMidiClips(): boolean {
  const selected = selectedBlocks();
  if (selected.length === 0 || selected.some(block => block.type !== 'midi')) {
    return false;
  }

  const trackId = selected[0]?.trackId;
  if (!trackId || selected.some(block => block.trackId !== trackId)) {
    return false;
  }

  const sorted = [...selected].sort((left, right) => left.startBeat - right.startBeat);
  const startBeat = sorted[0]!.startBeat;
  const endBeat = Math.max(...sorted.map(blockEndBeat));
  const notes = sorted
    .flatMap(block =>
      (block.notes ?? []).map(note => ({
        ...note,
        startBeat: block.startBeat - startBeat + note.startBeat,
      })),
    )
    .sort((left, right) => left.startBeat - right.startBeat || left.note - right.note);
  const consolidated: DAWBlock = {
    ...cloneBlock(sorted[0]!),
    id: nextConsolidatedId(sorted[0]!.id),
    name: `${sorted[0]!.name} Consolidated`,
    startBeat,
    lengthBeats: endBeat - startBeat,
    notes,
  };
  const removeIds = new Set(sorted.map(block => block.id));

  recordArrangementHistory(captureArrangementHistorySnapshot(useDAWStore.getState()));
  useDAWStore.setState(current => {
    let inserted = false;
    return {
      blocks: current.blocks.flatMap(block => {
        if (!removeIds.has(block.id)) {
          return [block];
        }
        if (inserted) {
          return [];
        }
        inserted = true;
        return [consolidated];
      }),
      selectedBlockId: consolidated.id,
      selectedBlockIds: [consolidated.id],
      selectedTrackId: consolidated.trackId,
      syncSource: 'ui',
    };
  });
  return true;
}
