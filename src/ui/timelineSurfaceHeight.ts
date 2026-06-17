export function timelineSurfaceHeight(
  contentHeight: number,
  viewportHeight: number,
): number {
  const safeContentHeight = Number.isFinite(contentHeight) ? contentHeight : 0;
  const safeViewportHeight = Number.isFinite(viewportHeight) ? viewportHeight : 0;
  return Math.max(0, safeContentHeight, safeViewportHeight);
}
