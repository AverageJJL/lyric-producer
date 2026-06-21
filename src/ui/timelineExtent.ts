import {blockEndBeat} from '../music/timelineCollision';
import type {LyricDocument} from '../store/lyrics';
import type {SectionMarker} from '../store/projectMetadata';
import type {DAWBlock} from '../store/useDAWStore';
import {DEFAULT_TIMELINE_BEATS, PIXELS_PER_BEAT} from './timelineLayout';

/** Extra bars past content so recording/dragging always has scroll room. */
export const TIMELINE_EXTENT_BUFFER_BEATS = 32;

/** Round timeline width up to this many beats for stable ruler/grid steps. */
export const TIMELINE_EXTENT_ROUND_BEATS = 16;

export type TimelineExtentInput = {
  blocks: DAWBlock[];
  sections?: SectionMarker[];
  lyrics?: LyricDocument;
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

function maxSectionEndBeat(sections: SectionMarker[] | undefined): number {
  return (sections ?? []).reduce(
    (maxEnd, section) => Math.max(maxEnd, Math.max(0, section.startBeat) + Math.max(0, section.lengthBeats)),
    0,
  );
}

function maxLyricEndBeat(lyrics: LyricDocument | undefined): number {
  return (lyrics?.sections ?? []).reduce((maxEnd, section, index, sections) => {
    const startBeat = section.startBeat ?? 0;
    const endBeat = section.endBeat
      ?? sections.slice(index + 1).find(item => item.startBeat !== undefined)?.startBeat
      ?? startBeat;
    return Math.max(maxEnd, endBeat);
  }, 0);
}

/**
 * Arrangement width in beats grows with clips, markers, and playhead like Logic/Waveform scroll areas.
 * Not literally infinite; extends in 16-beat steps with trailing buffer.
 */
export function computeVisibleTimelineBeats(input: TimelineExtentInput): number {
  const minBeats = input.minBeats ?? DEFAULT_TIMELINE_BEATS;
  const buffer = input.bufferBeats ?? TIMELINE_EXTENT_BUFFER_BEATS;
  const contentEnd = Math.max(
    input.playheadBeat,
    maxBlockEndBeat(input.blocks, input.recordingBlockId),
    maxSectionEndBeat(input.sections),
    maxLyricEndBeat(input.lyrics),
  );
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
