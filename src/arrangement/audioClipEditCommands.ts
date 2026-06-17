import {isDrumPatternBlock} from '../music/clipFactories';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';

export const AUDIO_SLIP_STEP_BEATS = 0.25;
export const AUDIO_SLIDE_STEP_BEATS = 0.25;
export const AUDIO_CLIP_GAIN_STEP_DB = 1;
export const AUDIO_FADE_STEP_BEATS = 0.25;
export const AUDIO_TRIM_STEP_BEATS = 0.25;
export const AUDIO_NORMALIZE_TARGET_DB = -1;
export const MIN_AUDIO_CLIP_GAIN_DB = -60;
export const MAX_AUDIO_CLIP_GAIN_DB = 24;

export type AudioFadeEdge = 'in' | 'out';

function hasSlipSource(block: DAWBlock): boolean {
  return block.type === 'audio' && !isDrumPatternBlock(block);
}

export function maxAudioSourceOffset(block: DAWBlock): number {
  if (!hasSlipSource(block)) {
    return 0;
  }
  const sourceLength = Math.max(block.lengthBeats, block.sourceLengthBeats ?? block.lengthBeats);
  return Math.max(0, sourceLength - block.lengthBeats);
}

export function clampAudioSourceOffset(block: DAWBlock, offsetBeats: number): number {
  return Math.max(0, Math.min(maxAudioSourceOffset(block), offsetBeats));
}

export function clampAudioClipGainDb(gainDb: number): number {
  return Math.max(MIN_AUDIO_CLIP_GAIN_DB, Math.min(MAX_AUDIO_CLIP_GAIN_DB, gainDb));
}

export function normalizedClipGainDb(sourcePeakAmplitude: number | undefined): number | null {
  if (
    typeof sourcePeakAmplitude !== 'number'
    || !Number.isFinite(sourcePeakAmplitude)
    || sourcePeakAmplitude <= 0.000001
  ) {
    return null;
  }

  const sourcePeakDb = 20 * Math.log10(sourcePeakAmplitude);
  return clampAudioClipGainDb(AUDIO_NORMALIZE_TARGET_DB - sourcePeakDb);
}

export function canNormalizeAudioClip(block: DAWBlock | null | undefined): boolean {
  return Boolean(block && hasSlipSource(block) && normalizedClipGainDb(block.sourcePeakAmplitude) !== null);
}

function maxAudioFadeBeats(block: DAWBlock, edge: AudioFadeEdge): number {
  if (!hasSlipSource(block)) {
    return 0;
  }
  const oppositeFade = edge === 'in' ? block.fadeOutBeats ?? 0 : block.fadeInBeats ?? 0;
  return Math.max(0, block.lengthBeats - oppositeFade);
}

export function clampAudioFadeBeats(
  block: DAWBlock,
  edge: AudioFadeEdge,
  fadeBeats: number,
): number {
  return Math.max(0, Math.min(maxAudioFadeBeats(block, edge), fadeBeats));
}

function trimSignature(block: DAWBlock): string {
  return JSON.stringify({
    startBeat: block.startBeat,
    lengthBeats: block.lengthBeats,
    sourceOffsetBeats: block.sourceOffsetBeats,
    sourceLengthBeats: block.sourceLengthBeats,
  });
}

export function nudgeAudioClipTrimStart(blockId: string, deltaBeats: number): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const fixedEnd = block.startBeat + block.lengthBeats;
  const desiredStart = block.startBeat + deltaBeats;
  const before = trimSignature(block);
  state.resizeBlock(blockId, desiredStart, fixedEnd - desiredStart);
  const nextBlock = useDAWStore.getState().blocks.find(item => item.id === blockId);
  return Boolean(nextBlock && trimSignature(nextBlock) !== before);
}

export function nudgeAudioClipTrimEnd(blockId: string, deltaBeats: number): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const before = trimSignature(block);
  state.resizeBlock(blockId, block.startBeat, block.lengthBeats + deltaBeats);
  const nextBlock = useDAWStore.getState().blocks.find(item => item.id === blockId);
  return Boolean(nextBlock && trimSignature(nextBlock) !== before);
}

export function nudgeAudioClipSlide(blockId: string, deltaBeats: number): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const beforeStart = block.startBeat;
  const beforeOffset = block.sourceOffsetBeats;
  state.moveBlock(blockId, block.startBeat + deltaBeats, block.trackId);
  const nextBlock = useDAWStore.getState().blocks.find(item => item.id === blockId);
  return Boolean(
    nextBlock
      && nextBlock.startBeat !== beforeStart
      && nextBlock.sourceOffsetBeats === beforeOffset,
  );
}

export function nudgeAudioClipSourceOffset(blockId: string, deltaBeats: number): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const currentOffset = block.sourceOffsetBeats ?? 0;
  const nextOffset = clampAudioSourceOffset(block, currentOffset + deltaBeats);
  if (Math.abs(nextOffset - currentOffset) < 0.0001) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(item =>
      item.id === blockId ? {...item, sourceOffsetBeats: nextOffset} : item,
    ),
    syncSource: 'ui',
  }));
  return true;
}

export function nudgeAudioClipFade(
  blockId: string,
  edge: AudioFadeEdge,
  deltaBeats: number,
): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const currentFade = edge === 'in' ? block.fadeInBeats ?? 0 : block.fadeOutBeats ?? 0;
  const nextFade = clampAudioFadeBeats(block, edge, currentFade + deltaBeats);
  if (Math.abs(nextFade - currentFade) < 0.0001) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(item =>
      item.id === blockId
        ? edge === 'in'
          ? {...item, fadeInBeats: nextFade}
          : {...item, fadeOutBeats: nextFade}
        : item,
    ),
    syncSource: 'ui',
  }));
  return true;
}

export function toggleAudioClipReverse(blockId: string): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(item =>
      item.id === blockId ? {...item, isReversed: !block.isReversed} : item,
    ),
    syncSource: 'ui',
  }));
  return true;
}

export function nudgeAudioClipGainDb(blockId: string, deltaDb: number): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const currentGain = block.clipGainDb ?? 0;
  const nextGain = clampAudioClipGainDb(currentGain + deltaDb);
  if (Math.abs(nextGain - currentGain) < 0.0001) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(item =>
      item.id === blockId ? {...item, clipGainDb: nextGain} : item,
    ),
    syncSource: 'ui',
  }));
  return true;
}

export function normalizeAudioClipGain(blockId: string): boolean {
  const state = useDAWStore.getState();
  const block = state.blocks.find(item => item.id === blockId);
  if (!block || !hasSlipSource(block)) {
    return false;
  }

  const nextGain = normalizedClipGainDb(block.sourcePeakAmplitude);
  if (nextGain === null) {
    return false;
  }

  const currentGain = block.clipGainDb ?? 0;
  if (Math.abs(nextGain - currentGain) < 0.0001) {
    return false;
  }

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    blocks: current.blocks.map(item =>
      item.id === blockId ? {...item, clipGainDb: nextGain} : item,
    ),
    syncSource: 'ui',
  }));
  return true;
}
