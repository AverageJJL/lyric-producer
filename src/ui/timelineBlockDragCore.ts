import {isDrumPatternBlock} from '../music/clipFactories';
import type {DAWBlock} from '../store/useDAWStore';
import {PIXELS_PER_BEAT} from './timelineLayout';

/** MIDI + drum blocks: left edge drags the clip; recorded audio keeps left-trim. */
export function isMoveLeftEdgeBlock(block: DAWBlock): boolean {
  return block.type === 'midi' || isDrumPatternBlock(block);
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
