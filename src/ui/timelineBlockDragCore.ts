import {isDrumPatternBlock} from '../music/clipFactories';
import type {DAWBlock} from '../store/useDAWStore';
import {PIXELS_PER_BEAT} from './timelineLayout';

/** Drum patterns still keep left-edge move until pattern source-offset semantics exist. */
export function isMoveLeftEdgeBlock(block: DAWBlock): boolean {
  return isDrumPatternBlock(block);
}

export function usesAudioTrimResize(block: DAWBlock): boolean {
  return block.type === 'audio' && block.sourceLengthBeats !== undefined && !isDrumPatternBlock(block);
}

/** Overlay surface + edge handles (MIDI, drum loops, recorded voice/audio). */
export function usesOverlayClipShell(block: DAWBlock): boolean {
  return block.type === 'midi' || block.type === 'audio';
}

function widthInsetPx(block: DAWBlock): number {
  return usesOverlayClipShell(block) ? 0 : 6;
}

/** Pixel width during live resize: overlay clips use full beat width. */
export function blockResizeVisualWidthPx(
  block: DAWBlock,
  lengthBeats: number,
  pixelsPerBeat = PIXELS_PER_BEAT,
): number {
  return lengthBeats * pixelsPerBeat - widthInsetPx(block);
}
