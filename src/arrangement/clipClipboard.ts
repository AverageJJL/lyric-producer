import {isDrumPatternBlock} from '../music/clipFactories';
import {BEATS_PER_BAR, type DrumPattern} from '../music/drumPatterns';
import {resolvePasteOverlaps} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import type {DAWBlock, DAWStore, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {
  clipboardItemForBlock,
  cloneBlock,
  cloneNotes,
  clonePattern,
  destinationTrackTypeForForm,
  getClipForm,
  type ClipClipboardPayload,
} from './clipClipboardModel';

export {getClipForm};
export type {
  ClipClipboardForm,
  ClipClipboardItem,
  ClipClipboardPayload,
} from './clipClipboardModel';

let clipboard: ClipClipboardPayload | null = null;
let idCounter = 0;

function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

function recordHistory(): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(useDAWStore.getState()));
}

/** Playhead lands after the primary bar for extended drum loops. */
export function playheadAfterPastedBlock(block: DAWBlock): number {
  if (isDrumPatternBlock(block)) {
    return block.startBeat + Math.min(block.lengthBeats, BEATS_PER_BAR);
  }
  return block.startBeat + block.lengthBeats;
}

export function hasClipboardPayload(): boolean {
  return clipboard !== null;
}

export function getClipboardPayloadForTests(): ClipClipboardPayload | null {
  return clipboard;
}

export function resetClipboardForTests(): void {
  clipboard = null;
  idCounter = 0;
}

function buildClipboardPayload(
  selectedBlocks: DAWBlock[],
  tracks: DAWTrack[],
  patterns: Record<string, DrumPattern>,
  activeBlockId: string | null,
): ClipClipboardPayload | null {
  if (selectedBlocks.length === 0) {
    return null;
  }

  const trackEntries = selectedBlocks.map(block => {
    const trackIndex = tracks.findIndex(track => track.id === block.trackId);
    const track = trackIndex >= 0 ? tracks[trackIndex] : undefined;
    return track ? {block, track, trackIndex} : null;
  });

  if (trackEntries.some(entry => entry === null)) {
    return null;
  }

  const typedEntries = trackEntries as {block: DAWBlock; track: DAWTrack; trackIndex: number}[];
  const selectionStartBeat = Math.min(...typedEntries.map(entry => entry.block.startBeat));
  const selectionStartTrackIndex = Math.min(...typedEntries.map(entry => entry.trackIndex));
  const items = typedEntries.map(entry =>
    clipboardItemForBlock(
      entry.block,
      entry.track,
      patterns,
      selectionStartBeat,
      selectionStartTrackIndex,
      entry.trackIndex,
    ),
  );

  if (items.some(item => item === null)) {
    return null;
  }

  const sortedItems = (items as NonNullable<(typeof items)[number]>[])
    .sort((left, right) =>
      left.trackOffset - right.trackOffset ||
      left.startOffsetBeats - right.startOffsetBeats ||
      left.block.id.localeCompare(right.block.id),
    );
  const primary = sortedItems.find(item => item.block.id === activeBlockId) ?? sortedItems[0]!;

  return {
    form: primary.form,
    block: cloneBlock(primary.block),
    pattern: primary.pattern ? clonePattern(primary.pattern) : null,
    items: sortedItems,
    anchorTrackOffset: primary.trackOffset,
  };
}

function selectedClipboardBlockIds(state: DAWStore): string[] {
  const ids = [...state.selectedBlockIds];
  if (state.selectedBlockId && !ids.includes(state.selectedBlockId)) {
    ids.push(state.selectedBlockId);
  }
  const existing = new Set(state.blocks.map(block => block.id));
  return [...new Set(ids)].filter(id => existing.has(id));
}

/** Copy the selected timeline block into the in-app clipboard. */
export function copySelectedBlockToClipboard(): boolean {
  const state = useDAWStore.getState();
  const blockIds = selectedClipboardBlockIds(state);
  if (blockIds.length === 0) {
    return false;
  }

  if (state.isRecording && state.recordingBlockId && blockIds.includes(state.recordingBlockId)) {
    return false;
  }

  const selectedBlocks = blockIds
    .map(id => state.blocks.find(block => block.id === id))
    .filter((block): block is DAWBlock => Boolean(block));
  const payload = buildClipboardPayload(
    selectedBlocks,
    state.tracks,
    state.patterns,
    state.selectedBlockId,
  );
  if (!payload) {
    return false;
  }

  clipboard = payload;
  return true;
}

/** Copy then remove the selected block (undoable via removeBlock history). */
export function cutSelectedBlockToClipboard(): boolean {
  const state = useDAWStore.getState();
  const blockIds = selectedClipboardBlockIds(state);
  if (!copySelectedBlockToClipboard()) {
    return false;
  }

  state.removeBlocks(blockIds);
  return true;
}

function destinationTracksForPayload(
  state: DAWStore,
  payload: ClipClipboardPayload,
): DAWTrack[] | null {
  const targetTrackIndex = state.tracks.findIndex(track => track.id === state.selectedTrackId);
  if (targetTrackIndex < 0) {
    return null;
  }

  const destinations = payload.items.map(item => {
    const destinationIndex = targetTrackIndex + item.trackOffset - payload.anchorTrackOffset;
    const targetTrack = state.tracks[destinationIndex];
    if (!targetTrack || targetTrack.type !== destinationTrackTypeForForm(item.form)) {
      return null;
    }
    return targetTrack;
  });

  return destinations.some(track => track === null) ? null : destinations as DAWTrack[];
}

/** Paste clipboard at playhead on the selected compatible track. */
export function pasteClipboardToArrangement(): boolean {
  if (!clipboard) {
    return false;
  }

  const state = useDAWStore.getState();
  const targetTrackId = state.selectedTrackId;
  if (!targetTrackId) {
    return false;
  }

  const targetTracks = destinationTracksForPayload(state, clipboard);
  if (!targetTracks) {
    return false;
  }

  const desiredStart = state.playheadBeat;
  const patternUpdates: Record<string, DrumPattern> = {};
  const pasted = clipboard.items.map((item, index) => {
    const source = item.block;
    const newBlockId = nextId('block-paste');
    let patternId = source.patternId;

    if (item.form === 'drum_machine_pattern') {
      const newPatternId = nextId('pattern');
      patternUpdates[newPatternId] = {
        ...clonePattern(item.pattern!),
        id: newPatternId,
      };
      patternId = newPatternId;
    }

    return {
      sourceId: source.id,
      block: {
        ...cloneBlock(source),
        id: newBlockId,
        trackId: targetTracks[index]!.id,
        startBeat: desiredStart + item.startOffsetBeats,
        patternId,
        notes: cloneNotes(source.notes),
      },
    };
  });
  const pastedBlocks = pasted.map(item => item.block);
  const primaryBlock = pasted.find(item => item.sourceId === clipboard.block.id)?.block
    ?? pastedBlocks[pastedBlocks.length - 1]!;

  recordHistory();
  useDAWStore.setState(prev => ({
    blocks: pastedBlocks.reduce(
      (blocks, pastedBlock) => resolvePasteOverlaps(blocks, pastedBlock),
      prev.blocks,
    ),
    patterns: Object.keys(patternUpdates).length > 0
      ? {...prev.patterns, ...patternUpdates}
      : prev.patterns,
    selectedBlockId: primaryBlock.id,
    selectedBlockIds: pastedBlocks.map(block => block.id),
    selectedTrackId: primaryBlock.trackId,
    syncSource: 'ui',
  }));

  if (!state.isPlaying) {
    const endBeat = Math.max(...pastedBlocks.map(playheadAfterPastedBlock));
    useDAWStore.getState().setPlayheadBeat(endBeat, {syncTransport: false});
  }
  return true;
}
