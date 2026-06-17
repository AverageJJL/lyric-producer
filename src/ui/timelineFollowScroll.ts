/**
 * Parent timeline horizontal scroll — keeps playhead in view during play/record.
 */

export type TimelineFollowScrollInput = {
  scrollLeft: number;
  viewportWidth: number;
  playheadPx: number;
  /** Distance from viewport edge before auto-scroll kicks in. */
  marginPx?: number;
};

/** Returns new scrollLeft when playhead is near an edge; null if no change needed. */
export function nextTimelineScrollLeft(input: TimelineFollowScrollInput): number | null {
  const marginPx = input.marginPx ?? 120;
  const {scrollLeft, viewportWidth, playheadPx} = input;
  const rightEdge = scrollLeft + viewportWidth;

  if (playheadPx > rightEdge - marginPx) {
    return Math.max(0, playheadPx - viewportWidth + marginPx);
  }
  if (playheadPx < scrollLeft + marginPx) {
    return Math.max(0, playheadPx - marginPx);
  }
  return null;
}
