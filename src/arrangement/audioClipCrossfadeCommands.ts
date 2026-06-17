import {isDrumPatternBlock} from '../music/clipFactories';
import {blockEndBeat} from '../music/timelineCollision';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {clampAudioFadeBeats} from './audioClipEditCommands';

export const AUDIO_CROSSFADE_BEATS = 0.25;

const ADJACENT_EPSILON = 0.000001;

type CrossfadePair = {
  left: DAWBlock;
  right: DAWBlock;
};

function isEditableAudioClip(block: DAWBlock): boolean {
  return block.type === 'audio' && !isDrumPatternBlock(block);
}

function selectedAudioClips(blocks: DAWBlock[], selectedBlockIds: string[]): DAWBlock[] {
  const selected = new Set(selectedBlockIds);
  if (selected.size < 2) {
    return [];
  }
  return blocks.filter(block => selected.has(block.id) && isEditableAudioClip(block));
}

function adjacentSelectedAudioPairs(
  blocks: DAWBlock[],
  selectedBlockIds: string[],
): CrossfadePair[] {
  const clips = selectedAudioClips(blocks, selectedBlockIds).sort((left, right) =>
    left.trackId.localeCompare(right.trackId) || left.startBeat - right.startBeat,
  );
  const pairs: CrossfadePair[] = [];
  for (let index = 0; index < clips.length - 1; index += 1) {
    const left = clips[index]!;
    const right = clips[index + 1]!;
    if (
      left.trackId === right.trackId &&
      Math.abs(blockEndBeat(left) - right.startBeat) <= ADJACENT_EPSILON
    ) {
      pairs.push({left, right});
    }
  }
  return pairs;
}

export function canCrossfadeAudioClips(
  blocks: DAWBlock[],
  selectedBlockIds: string[],
): boolean {
  return adjacentSelectedAudioPairs(blocks, selectedBlockIds).length > 0;
}

function blockChanged(before: DAWBlock, after: DAWBlock): boolean {
  return (before.fadeInBeats ?? 0) !== (after.fadeInBeats ?? 0) ||
    (before.fadeOutBeats ?? 0) !== (after.fadeOutBeats ?? 0);
}

export function crossfadeSelectedAudioClips(
  durationBeats = AUDIO_CROSSFADE_BEATS,
): boolean {
  if (!Number.isFinite(durationBeats) || durationBeats <= 0) {
    return false;
  }

  const state = useDAWStore.getState();
  const pairs = adjacentSelectedAudioPairs(state.blocks, state.selectedBlockIds);
  const updates = new Map<string, DAWBlock>();
  pairs.forEach(({left, right}) => {
    const nextLeft = updates.get(left.id) ?? left;
    const nextRight = updates.get(right.id) ?? right;
    updates.set(left.id, {
      ...nextLeft,
      fadeOutBeats: clampAudioFadeBeats(nextLeft, 'out', durationBeats),
    });
    updates.set(right.id, {
      ...nextRight,
      fadeInBeats: clampAudioFadeBeats(nextRight, 'in', durationBeats),
    });
  });

  const changed = [...updates.entries()].some(([id, nextBlock]) => {
    const before = state.blocks.find(block => block.id === id);
    return before ? blockChanged(before, nextBlock) : false;
  });
  if (!changed) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(block => updates.get(block.id) ?? block),
    syncSource: 'ui',
  }));
  return true;
}
