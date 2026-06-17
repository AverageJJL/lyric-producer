/** Viewport-aware fixed position for pointer-anchored popups. */
export function anchoredPopupPosition(
  anchorX: number,
  anchorY: number,
  panelWidth: number,
  panelHeight: number,
  gap = 10,
): {left: number; top: number} {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - panelWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);

  let left = Math.min(Math.max(margin, anchorX), maxLeft);
  let top = anchorY + gap;

  if (top + panelHeight > window.innerHeight - margin) {
    top = anchorY - panelHeight - gap;
  }
  top = Math.min(Math.max(margin, top), maxTop);

  if (left + panelWidth > window.innerWidth - margin) {
    left = Math.max(margin, window.innerWidth - panelWidth - margin);
  }

  return {left, top};
}
