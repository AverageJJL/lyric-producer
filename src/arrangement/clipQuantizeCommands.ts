import {isDrumPatternBlock} from '../music/clipFactories';
import {beatsPerBarForTimeSignature} from '../store/projectMetadata';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {snapBeatToGrid, type SnapGrid} from '../ui/snapGrid';
import {sanitizePianoRollNote} from './midiNoteEditCommands';

const DEFAULT_QUANTIZE_GRID: SnapGrid = '1/16';

function selectedClipIds(state: ReturnType<typeof useDAWStore.getState>): string[] {
  const ids = state.selectedBlockIds.length > 0
    ? state.selectedBlockIds
    : state.selectedBlockId ? [state.selectedBlockId] : [];
  const existing = new Set(state.blocks.map(block => block.id));
  return [...new Set(ids)].filter(id => existing.has(id));
}

function quantizedBlock(
  block: DAWBlock,
  snapGrid: SnapGrid,
  beatsPerBar: number,
): DAWBlock | null {
  if (block.type !== 'midi' || isDrumPatternBlock(block) || !block.notes?.length) {
    return null;
  }

  const notes = block.notes.map(note => sanitizePianoRollNote(
    {...note, startBeat: snapBeatToGrid(note.startBeat, snapGrid, beatsPerBar)},
    block.lengthBeats,
  ));
  return JSON.stringify(notes) === JSON.stringify(block.notes) ? null : {...block, notes};
}

export function quantizeSelectedMidiClips(): boolean {
  const state = useDAWStore.getState();
  const ids = new Set(selectedClipIds(state));
  if (ids.size === 0) {
    return false;
  }

  const snapGrid = state.snapGrid === 'off' ? DEFAULT_QUANTIZE_GRID : state.snapGrid;
  const beatsPerBar = beatsPerBarForTimeSignature(state.timeSignature);
  const updates = new Map<string, DAWBlock>();
  state.blocks.forEach(block => {
    if (!ids.has(block.id)) {
      return;
    }
    const nextBlock = quantizedBlock(block, snapGrid, beatsPerBar);
    if (nextBlock) {
      updates.set(block.id, nextBlock);
    }
  });
  if (updates.size === 0) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(block => updates.get(block.id) ?? block),
    syncSource: 'ui',
  }));
  return true;
}
