import type {SectionMarker} from '../store/projectMetadata';
import {hasWrittenLyricText, type LyricDocument} from '../store/lyrics';
import {
  RULER_BASE_HEIGHT,
  RULER_LANE_BOTTOM_PADDING,
  RULER_LANE_GAP,
  RULER_LANE_HEIGHT,
  RULER_LANE_TOP,
} from './timelineLayout';

export type TimelineHeaderVisibility = {
  hasLyricsLane: boolean;
  hasMarkerLane: boolean;
};

type TimelineHeaderInput = {
  sections: SectionMarker[];
  authoredLyrics?: LyricDocument;
  showAuthoredLyrics?: boolean;
};

export function timelineHasLyricsLane({
  sections,
  authoredLyrics,
  showAuthoredLyrics = true,
}: TimelineHeaderInput): boolean {
  return sections.some(section => Boolean(section.analysis))
    || (showAuthoredLyrics && hasWrittenLyricText(authoredLyrics));
}

export function timelineHeaderVisibility(input: TimelineHeaderInput): TimelineHeaderVisibility {
  return {
    hasLyricsLane: timelineHasLyricsLane(input),
    hasMarkerLane: input.sections.length > 0,
  };
}

export function timelineMarkerLaneTop(visibility: TimelineHeaderVisibility): number {
  return RULER_LANE_TOP + (visibility.hasLyricsLane ? RULER_LANE_HEIGHT + RULER_LANE_GAP : 0);
}

export function timelineRulerHeight(visibility: TimelineHeaderVisibility): number {
  const laneCount = Number(visibility.hasLyricsLane) + Number(visibility.hasMarkerLane);
  if (laneCount === 0) {
    return RULER_BASE_HEIGHT;
  }
  return RULER_LANE_TOP
    + laneCount * RULER_LANE_HEIGHT
    + (laneCount - 1) * RULER_LANE_GAP
    + RULER_LANE_BOTTOM_PADDING;
}
