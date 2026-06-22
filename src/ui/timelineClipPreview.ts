import type {DAWBlock} from '../store/useDAWStore';
import {usesAudioTrimResize} from './timelineBlockDragCore';
import type {BlockDragMode} from './timelineBlockPointerDrag';

export function previewAudioSourceOffsetBeats(
  block: DAWBlock,
  dragMode: BlockDragMode | null,
  previewStartBeat: number,
): number | undefined {
  if (usesAudioTrimResize(block) && dragMode === 'resize-left') {
    return (block.sourceOffsetBeats ?? 0) + (previewStartBeat - block.startBeat);
  }

  return block.sourceOffsetBeats;
}
