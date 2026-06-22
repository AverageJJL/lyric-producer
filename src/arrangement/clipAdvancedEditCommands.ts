import {isDrumPatternBlock} from '../music/clipFactories';
import {normalizeDrumPattern, type DrumPattern} from '../music/drumPatterns';
import {trimNotesToAbsoluteRange} from '../music/midiClipTrim';
import {resolvePasteOverlaps} from '../music/timelineCollision';
import {blockEndBeat} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock, type DAWNote} from '../store/useDAWStore';

let editSequence = 0;

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

function nextEditId(prefix: string): string {
  editSequence += 1;
  return `${prefix}-${Date.now()}-${editSequence}`;
}

function clonePattern(pattern: DrumPattern, id: string): DrumPattern {
  const normalized = normalizeDrumPattern(pattern);
  return {
    ...normalized,
    id,
    steps: Object.fromEntries(
      Object.entries(normalized.steps).map(([key, row]) => [key, [...row]]),
    ) as DrumPattern['steps'],
  };
}

function recordHistory(): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(useDAWStore.getState()));
}

function commitSingleBlockEdit(blockId: string, nextBlock: DAWBlock): boolean {
  const current = useDAWStore.getState().blocks.find(block => block.id === blockId);
  if (!current || JSON.stringify(current) === JSON.stringify(nextBlock)) {
    return false;
  }

  recordHistory();
  useDAWStore.setState(state => ({
    blocks: state.blocks.map(block => (block.id === blockId ? nextBlock : block)),
    selectedBlockId: nextBlock.id,
    selectedBlockIds: [nextBlock.id],
    selectedTrackId: nextBlock.trackId,
    syncSource: 'ui',
  }));
  return true;
}

export function trimSelectedClipStartToPlayhead(): boolean {
  const state = useDAWStore.getState();
  const source = state.selectedBlockId
    ? state.blocks.find(block => block.id === state.selectedBlockId)
    : null;
  if (!source || isDrumPatternBlock(source)) {
    return false;
  }

  const trimBeat = state.playheadBeat;
  const sourceEnd = blockEndBeat(source);
  if (trimBeat <= source.startBeat || trimBeat >= sourceEnd) {
    return false;
  }

  const delta = trimBeat - source.startBeat;
  const nextBlock: DAWBlock = {
    ...cloneBlock(source),
    startBeat: trimBeat,
    lengthBeats: sourceEnd - trimBeat,
    notes: trimNotesToAbsoluteRange(source, trimBeat, sourceEnd),
    sourceOffsetBeats:
      source.type === 'audio' && source.sourceOffsetBeats !== undefined
        ? source.sourceOffsetBeats + delta
        : source.sourceOffsetBeats,
  };

  return commitSingleBlockEdit(source.id, nextBlock);
}

export function trimSelectedClipEndToPlayhead(): boolean {
  const state = useDAWStore.getState();
  const source = state.selectedBlockId
    ? state.blocks.find(block => block.id === state.selectedBlockId)
    : null;
  if (!source || isDrumPatternBlock(source)) {
    return false;
  }

  const trimBeat = state.playheadBeat;
  const sourceEnd = blockEndBeat(source);
  if (trimBeat <= source.startBeat || trimBeat >= sourceEnd) {
    return false;
  }

  const nextBlock: DAWBlock = {
    ...cloneBlock(source),
    lengthBeats: trimBeat - source.startBeat,
    notes: trimNotesToAbsoluteRange(source, source.startBeat, trimBeat),
  };

  return commitSingleBlockEdit(source.id, nextBlock);
}

export function glueSelectedMidiClips(): boolean {
  const state = useDAWStore.getState();
  const selectedIds = [...new Set(state.selectedBlockIds)];
  if (selectedIds.length < 2) {
    return false;
  }

  const selected = selectedIds
    .map(id => state.blocks.find(block => block.id === id))
    .filter((block): block is DAWBlock => Boolean(block));
  if (selected.length < 2 || selected.some(block => block.type !== 'midi')) {
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
  const gluedBlock: DAWBlock = {
    ...cloneBlock(sorted[0]!),
    startBeat,
    lengthBeats: endBeat - startBeat,
    notes,
  };
  const removeIds = new Set(sorted.slice(1).map(block => block.id));

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: current.blocks.flatMap(block => {
      if (block.id === gluedBlock.id) {
        return [gluedBlock];
      }
      return removeIds.has(block.id) ? [] : [block];
    }),
    selectedBlockId: gluedBlock.id,
    selectedBlockIds: [gluedBlock.id],
    selectedTrackId: gluedBlock.trackId,
    syncSource: 'ui',
  }));
  return true;
}

export function repeatSelectedClipsOnce(): boolean {
  const state = useDAWStore.getState();
  const selectedIds = [
    ...new Set(state.selectedBlockIds.length > 0
      ? state.selectedBlockIds
      : state.selectedBlockId ? [state.selectedBlockId] : []),
  ];
  const selected = selectedIds
    .map(id => state.blocks.find(block => block.id === id))
    .filter((block): block is DAWBlock => Boolean(block));
  if (selected.length === 0) {
    return false;
  }

  const selectionStart = Math.min(...selected.map(block => block.startBeat));
  const selectionEnd = Math.max(...selected.map(blockEndBeat));
  const repeatOffset = selectionEnd - selectionStart;
  if (repeatOffset <= 0) {
    return false;
  }

  const patternUpdates: Record<string, DrumPattern> = {};
  const repeated = selected.map(block => {
    const nextBlock = {
      ...cloneBlock(block),
      id: nextEditId(`${block.id}-repeat`),
      startBeat: block.startBeat + repeatOffset,
    };

    if (isDrumPatternBlock(block) && block.patternId) {
      const pattern = state.patterns[block.patternId];
      if (pattern) {
        const patternId = nextEditId(`${block.patternId}-repeat`);
        patternUpdates[patternId] = clonePattern(pattern, patternId);
        nextBlock.patternId = patternId;
      }
    }

    return nextBlock;
  });

  recordHistory();
  useDAWStore.setState(current => {
    const blocks = repeated.reduce(
      (items, block) => resolvePasteOverlaps(items, block),
      current.blocks,
    );
    return {
      blocks,
      patterns: {...current.patterns, ...patternUpdates},
      selectedBlockId: repeated[repeated.length - 1]?.id ?? null,
      selectedBlockIds: repeated.map(block => block.id),
      selectedTrackId: repeated[repeated.length - 1]?.trackId ?? current.selectedTrackId,
      syncSource: 'ui',
    };
  });
  return true;
}
