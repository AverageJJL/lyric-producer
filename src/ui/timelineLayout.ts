/** Shared layout constants keep sidebar track rows aligned with timeline lanes. */
export const SIDEBAR_DEFAULT_WIDTH = 360;
export const SIDEBAR_MIN_WIDTH = 280;
export const TIMELINE_MIN_WIDTH = 460;

export function sidebarMaxWidth(
  windowWidth: number,
  horizontalInset = 0,
): number {
  return Math.max(SIDEBAR_MIN_WIDTH, windowWidth - TIMELINE_MIN_WIDTH - horizontalInset);
}

/** Minimum arrangement width; timeline grows beyond this as clips/playhead extend. */
export const DEFAULT_TIMELINE_BEATS = 64;

/** @deprecated Use DEFAULT_TIMELINE_BEATS or computeVisibleTimelineBeats — not a hard max. */
export const TIMELINE_BEATS = DEFAULT_TIMELINE_BEATS;
export const PIXELS_PER_BEAT = 48;
export const ROW_HEIGHT = 128;
export const RULER_HEIGHT = 82;
/** Matches `.track-sidebar-actions` so timeline scroll range aligns with the sidebar footer. */
export const TRACK_SIDEBAR_FOOTER_HEIGHT = 148;
export const BLOCK_VERTICAL_PADDING = 12;
/** Wide handles so edge resize wins over scroll on desktop pointer devices. */
export const RESIZE_HANDLE_WIDTH = 16;
/** Minimum timeline width while a zero-length recording clip is growing. */
export const RECORDING_MIN_VISIBLE_BEATS = 0.25;

export const BLOCK_COLORS = ['#5a8cff', '#a66cff', '#3ebd93', '#d0932f', '#ff6b81', '#48c9b0'];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function beatToPixels(beat: number): number {
  return beat * PIXELS_PER_BEAT;
}

export function pixelsToBeat(pixels: number): number {
  return Math.round(pixels / PIXELS_PER_BEAT);
}
