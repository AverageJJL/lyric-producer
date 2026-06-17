import {isDrumPatternBlock} from '../music/clipFactories';
import {normalizeDrumPattern, type DrumPattern} from '../music/drumPatterns';
import {blockEndBeat, resolvePasteOverlaps} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import type {SectionMarker} from '../store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWNote} from '../store/useDAWStore';

let sectionEditSequence = 0;

function nextSectionEditId(prefix: string): string {
  sectionEditSequence += 1;
  return `${prefix}-section-${Date.now()}-${sectionEditSequence}`;
}

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

function blocksContainedBySection(blocks: DAWBlock[], section: SectionMarker): DAWBlock[] {
  const startBeat = Math.max(0, section.startBeat);
  const endBeat = startBeat + Math.max(1, section.lengthBeats);
  return blocks.filter(block => block.startBeat >= startBeat && blockEndBeat(block) <= endBeat);
}

function recordHistory(): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(useDAWStore.getState()));
}

function cleanBeat(value: number): number {
  return Number(value.toFixed(6));
}

function sectionEndBeat(section: SectionMarker): number {
  return Math.max(0, section.startBeat) + Math.max(1, section.lengthBeats);
}

function notesAfterSectionSplit(
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
      rightNotes.push({...note, startBeat: cleanBeat(noteStart - splitBeat)});
    } else {
      leftNotes.push({...note, lengthBeats: cleanBeat(splitBeat - noteStart)});
      rightNotes.push({
        ...note,
        startBeat: 0,
        lengthBeats: cleanBeat(noteEnd - splitBeat),
      });
    }
  });

  return {leftNotes, rightNotes};
}

function splitBlockAtBeat(block: DAWBlock, splitBeat: number): {left: DAWBlock; right: DAWBlock} | null {
  const endBeat = blockEndBeat(block);
  if (splitBeat <= block.startBeat || splitBeat >= endBeat) {
    return null;
  }

  const leftLength = cleanBeat(splitBeat - block.startBeat);
  const rightLength = cleanBeat(endBeat - splitBeat);
  if (leftLength <= 0 || rightLength <= 0) {
    return null;
  }

  const {leftNotes, rightNotes} = notesAfterSectionSplit(block, splitBeat);
  const rightBlock: DAWBlock = {
    ...cloneBlock(block),
    id: nextSectionEditId(block.id),
    startBeat: cleanBeat(splitBeat),
    lengthBeats: rightLength,
    notes: rightNotes,
    sourceOffsetBeats:
      block.sourceOffsetBeats !== undefined
        ? cleanBeat(block.sourceOffsetBeats + leftLength)
        : block.sourceOffsetBeats,
  };

  return {
    left: {...cloneBlock(block), lengthBeats: leftLength, notes: leftNotes},
    right: rightBlock,
  };
}

export function duplicateSectionOnce(sectionId: string): boolean {
  const state = useDAWStore.getState();
  const section = state.sections.find(item => item.id === sectionId);
  if (!section) {
    return false;
  }

  const sourceBlocks = blocksContainedBySection(state.blocks, section);
  if (sourceBlocks.length === 0) {
    return false;
  }

  const offsetBeats = Math.max(1, section.lengthBeats);
  const patternUpdates: Record<string, DrumPattern> = {};
  const duplicated = sourceBlocks.map(block => {
    const nextBlock = {
      ...cloneBlock(block),
      id: nextSectionEditId(block.id),
      startBeat: block.startBeat + offsetBeats,
    };

    if (isDrumPatternBlock(block) && block.patternId) {
      const pattern = state.patterns[block.patternId];
      if (pattern) {
        const patternId = nextSectionEditId(block.patternId);
        patternUpdates[patternId] = clonePattern(pattern, patternId);
        nextBlock.patternId = patternId;
      }
    }

    return nextBlock;
  });

  const newSection = {
    ...section,
    id: nextSectionEditId(section.id),
    name: `${section.name} Copy`,
    startBeat: section.startBeat + offsetBeats,
  };

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: duplicated.reduce((items, block) => resolvePasteOverlaps(items, block), current.blocks),
    patterns: {...current.patterns, ...patternUpdates},
    sections: [...current.sections, newSection].sort((left, right) => left.startBeat - right.startBeat),
    selectedBlockId: duplicated[duplicated.length - 1]?.id ?? null,
    selectedBlockIds: duplicated.map(block => block.id),
    selectedTrackId: duplicated[duplicated.length - 1]?.trackId ?? current.selectedTrackId,
    syncSource: 'ui',
  }));
  return true;
}

export function splitSectionAtBeat(sectionId: string, beat?: number): boolean {
  const state = useDAWStore.getState();
  const section = state.sections.find(item => item.id === sectionId);
  if (!section) {
    return false;
  }

  const splitBeat = cleanBeat(beat ?? state.playheadBeat);
  const startBeat = Math.max(0, section.startBeat);
  const endBeat = sectionEndBeat(section);
  if (splitBeat <= startBeat || splitBeat >= endBeat) {
    return false;
  }

  const leftSection: SectionMarker = {
    ...section,
    startBeat,
    lengthBeats: cleanBeat(splitBeat - startBeat),
  };
  const rightSection: SectionMarker = {
    ...section,
    id: nextSectionEditId(section.id),
    name: `${section.name} Split`,
    startBeat: splitBeat,
    lengthBeats: cleanBeat(endBeat - splitBeat),
  };

  const rightBlocks: DAWBlock[] = [];
  const nextBlocks = state.blocks.flatMap(block => {
    const split = splitBlockAtBeat(block, splitBeat);
    if (!split) {
      return [block];
    }
    rightBlocks.push(split.right);
    return [split.left, split.right];
  });

  recordHistory();
  useDAWStore.setState(current => ({
    blocks: nextBlocks,
    sections: current.sections
      .flatMap(item => (item.id === sectionId ? [leftSection, rightSection] : [item]))
      .sort((left, right) => left.startBeat - right.startBeat),
    selectedBlockId: rightBlocks[rightBlocks.length - 1]?.id ?? current.selectedBlockId,
    selectedBlockIds: rightBlocks.length > 0
      ? rightBlocks.map(block => block.id)
      : current.selectedBlockIds,
    selectedTrackId: rightBlocks[rightBlocks.length - 1]?.trackId ?? current.selectedTrackId,
    syncSource: 'ui',
  }));
  return true;
}
