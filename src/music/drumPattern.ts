/** Quantize a beat offset inside a clip to a 16th-step index (0–15 per bar). */
export function drumStepFromClipBeat(relativeBeat: number): number {
  return Math.max(0, Math.floor(relativeBeat * 4));
}
