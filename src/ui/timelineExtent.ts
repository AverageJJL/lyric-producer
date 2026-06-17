import {blockEndBeat} from '../music/timelineCollision';
import type {DAWBlock} from '../store/useDAWStore';
import {DEFAULT_TIMELINE_BEATS, PIXELS_PER_BEAT} from './timelineLayout';

/** Extra bars past content so recording/dragging always has scroll room. */
export const TIMELINE_EXTENT_BUFFER_BEATS = 32;

/** Round timeline width up to this many beats for stable ruler/grid steps. */
export const TIMELINE_EXTENT_ROUND_BEATS = 16;

export type TimelineExtentInput = {
  blocks: DAWBlock[];
  playheadBeat: number;
  recordingBlockId?: string | null;
  minBeats?: number;
  bufferBeats?: number;
};

function maxBlockEndBeat(blocks: DAWBlock[], recordingBlockId: string | null | undefined): number {
  let maxEnd = 0;
  for (const block of blocks) {
    let end = blockEndBeat(block);
    if (recordingBlockId && block.id === recordingBlockId && block.name === 'Recording') {
      end = Math.max(end, block.startBeat + block.lengthBeats);
    }
    maxEnd = Math.max(maxEnd, end);
  }
  return maxEnd;
}

/**
 * Arrangement width in beats — grows with clips/playhead like Logic/Waveform scroll areas.
 * Not literally infinite; extends in 16-beat steps with trailing buffer.
 */
export function computeVisibleTimelineBeats(input: TimelineExtentInput): number {
  const minBeats = input.minBeats ?? DEFAULT_TIMELINE_BEATS;
  const buffer = input.bufferBeats ?? TIMELINE_EXTENT_BUFFER_BEATS;
  const contentEnd = Math.max(input.playheadBeat, maxBlockEndBeat(input.blocks, input.recordingBlockId));
  const withBuffer = contentEnd + buffer;
  const rounded =
    Math.ceil(Math.max(minBeats, withBuffer) / TIMELINE_EXTENT_ROUND_BEATS)
    * TIMELINE_EXTENT_ROUND_BEATS;
  return Math.max(minBeats, rounded);
}

export function timelineWidthPx(
  visibleTimelineBeats: number,
  pixelsPerBeat = PIXELS_PER_BEAT,
): number {
  return visibleTimelineBeats * pixelsPerBeat;
}
