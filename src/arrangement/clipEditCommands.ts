import {blockEndBeat, clampMoveStartBeat} from '../music/timelineCollision';
import {computeVisibleTimelineBeats} from '../ui/timelineExtent';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock, type DAWNote} from '../store/useDAWStore';

let clipboardBlock: DAWBlock | null = null;
let clipboardSequence = 0;

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

function nextClipId(sourceId: string): string {
  clipboardSequence += 1;
  return `${sourceId}-edit-${Date.now()}-${clipboardSequence}`;
}

function maxTimelineBeat(blocks: DAWBlock[], playheadBeat: number): number {
  return computeVisibleTimelineBeats({blocks, playheadBeat});
}

function recordHistory(): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(useDAWStore.getState()));
}

export function copySelectedClip(): boolean {
  const state = useDAWStore.getState();
  const block = state.selectedBlockId
    ? state.blocks.find(item => item.id === state.selectedBlockId)
    : null;
  if (!block) {
    return false;
  }

  clipboardBlock = cloneBlock(block);
  return true;
}

export function pasteClipboardAtPlayhead(): boolean {
  if (!clipboardBlock) {
    return false;
  }

  const state = useDAWStore.getState();
  const clipId = nextClipId(clipboardBlock.id);
  const startBeat = clampMoveStartBeat(
    state.blocks,
    clipId,
    clipboardBlock.trackId,
    clipboardBlock.lengthBeats,
    state.playheadBeat,
    maxTimelineBeat(state.blocks, state.playheadBeat),
  );
  const block = {
    ...cloneBlock(clipboardBlock),
    id: clipId,
    startBeat,
  };

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: [...current.blocks, block],
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    selectedTrackId: block.trackId,
    syncSource: 'ui',
  }));
  return true;
}

export function duplicateSelectedClip(): boolean {
  const state = useDAWStore.getState();
  const source = state.selectedBlockId
    ? state.blocks.find(block => block.id === state.selectedBlockId)
    : null;
  if (!source) {
    return false;
  }

  const desiredStart = blockEndBeat(source);
  const clipId = nextClipId(source.id);
  const startBeat = clampMoveStartBeat(
    state.blocks,
    clipId,
    source.trackId,
    source.lengthBeats,
    desiredStart,
    maxTimelineBeat(state.blocks, desiredStart),
  );
  const duplicate = {
    ...cloneBlock(source),
    id: clipId,
    startBeat,
  };

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: [...current.blocks, duplicate],
    selectedBlockId: duplicate.id,
    selectedBlockIds: [duplicate.id],
    selectedTrackId: duplicate.trackId,
    syncSource: 'ui',
  }));
  return true;
}

function splitNotes(
  block: DAWBlock,
  splitBeat: number,
): {leftNotes?: DAWNote[]; rightNotes?: DAWNote[]} {
  if (!block.notes) {
    return {};
  }

  const leftNotes: DAWNote[] = [];
  const rightNotes: DAWNote[] = [];
  block.notes.forEach(note => {
    const noteStart = block.startBeat + note.startBeat;
    const noteEnd = noteStart + note.lengthBeats;
    if (noteEnd <= splitBeat) {
      leftNotes.push(cloneNote(note));
    } else if (noteStart >= splitBeat) {
      rightNotes.push({...note, startBeat: noteStart - splitBeat});
    } else {
      leftNotes.push({...note, lengthBeats: splitBeat - noteStart});
      rightNotes.push({...note, startBeat: 0, lengthBeats: noteEnd - splitBeat});
    }
  });

  return {leftNotes, rightNotes};
}

export function splitSelectedClipAtPlayhead(): boolean {
  const state = useDAWStore.getState();
  const source = state.selectedBlockId
    ? state.blocks.find(block => block.id === state.selectedBlockId)
    : null;
  if (!source) {
    return false;
  }

  const splitBeat = state.playheadBeat;
  const sourceEnd = blockEndBeat(source);
  if (splitBeat <= source.startBeat || splitBeat >= sourceEnd) {
    return false;
  }

  const leftLength = splitBeat - source.startBeat;
  const rightLength = sourceEnd - splitBeat;
  if (leftLength <= 0 || rightLength <= 0) {
    return false;
  }

  const {leftNotes, rightNotes} = splitNotes(source, splitBeat);
  const rightBlock: DAWBlock = {
    ...cloneBlock(source),
    id: nextClipId(source.id),
    startBeat: splitBeat,
    lengthBeats: rightLength,
    notes: rightNotes,
    sourceOffsetBeats:
      source.sourceOffsetBeats !== undefined
        ? source.sourceOffsetBeats + leftLength
        : source.sourceOffsetBeats,
  };
  const leftBlock: DAWBlock = {
    ...cloneBlock(source),
    lengthBeats: leftLength,
    notes: leftNotes,
  };

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: current.blocks.flatMap(block =>
      block.id === source.id ? [leftBlock, rightBlock] : [block],
    ),
    selectedBlockId: rightBlock.id,
    selectedBlockIds: [rightBlock.id],
    selectedTrackId: rightBlock.trackId,
    syncSource: 'ui',
  }));
  return true;
}

export {
  consolidateSelectedMidiClips,
} from './clipConsolidateCommands';

export {
  quantizeSelectedMidiClips,
} from './clipQuantizeCommands';

export {
  glueSelectedMidiClips,
  repeatSelectedClipsOnce,
  trimSelectedClipEndToPlayhead,
  trimSelectedClipStartToPlayhead,
} from './clipAdvancedEditCommands';

export {
  trimSelectedClipsToCycleRange,
} from './clipTrimToSelectionCommands';
