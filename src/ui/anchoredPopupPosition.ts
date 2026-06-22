type AnchoredPopupPositionOptions = {
  gap?: number;
  rightInset?: number;
};

function popupOptions(options: AnchoredPopupPositionOptions | number): Required<AnchoredPopupPositionOptions> {
  if (typeof options === 'number') {
    return {gap: options, rightInset: 0};
  }
  return {
    gap: options.gap ?? 10,
    rightInset: Math.max(0, options.rightInset ?? 0),
  };
}

/** Viewport-aware fixed position for pointer-anchored popups. */
export function anchoredPopupPosition(
  anchorX: number,
  anchorY: number,
  panelWidth: number,
  panelHeight: number,
  options: AnchoredPopupPositionOptions | number = {},
): {left: number; top: number} {
  const {gap, rightInset} = popupOptions(options);
  const margin = 8;
  const usableRight = Math.max(margin + panelWidth, window.innerWidth - rightInset);
  const maxLeft = Math.max(margin, usableRight - panelWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - panelHeight - margin);

  let left = Math.min(Math.max(margin, anchorX), maxLeft);
  let top = anchorY + gap;

  if (top + panelHeight > window.innerHeight - margin) {
    top = anchorY - panelHeight - gap;
  }
  top = Math.min(Math.max(margin, top), maxTop);

  if (left + panelWidth > usableRight - margin) {
    left = Math.max(margin, usableRight - panelWidth - margin);
  }

  return {left, top};
}
