/** Pixels per beat for clip interior previews from the clip's on-screen width (timeline zoom + block width). */
export function clipDisplayPixelsPerBeat(widthPx: number, lengthBeats: number): number {
  return widthPx / Math.max(lengthBeats, 1e-6);
}
