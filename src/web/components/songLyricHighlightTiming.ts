export const BASE_WORD_HIGHLIGHT_MS = 95;
export const LINE_PAUSE_MS = 130;
export const MIN_SECTION_HOLD_MS = 360;
export const MAX_SECTION_HOLD_MS = 2400;
const MIN_WORD_HIGHLIGHT_MS = 45;

export type LyricHighlightTiming = {
  wordMs: number;
  linePauseMs: number;
  totalMs: number;
  wordCount: number;
  lineCount: number;
};

export function splitLyricWords(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

export function lyricHighlightTiming(lines: string[]): LyricHighlightTiming {
  const wordCounts = lines.map(line => splitLyricWords(line).length).filter(count => count > 0);
  const wordCount = Math.max(1, wordCounts.reduce((sum, count) => sum + count, 0));
  const lineCount = Math.max(1, wordCounts.length);
  const pauseTotal = Math.max(0, lineCount - 1) * LINE_PAUSE_MS;
  const holdTotal = pauseTotal + LINE_PAUSE_MS;
  const baseTotal = wordCount * BASE_WORD_HIGHLIGHT_MS + holdTotal;
  const wordMs = baseTotal > MAX_SECTION_HOLD_MS
    ? Math.max(MIN_WORD_HIGHLIGHT_MS, Math.floor((MAX_SECTION_HOLD_MS - holdTotal) / wordCount))
    : BASE_WORD_HIGHLIGHT_MS;
  const totalMs = Math.max(
    MIN_SECTION_HOLD_MS,
    Math.min(MAX_SECTION_HOLD_MS, wordCount * wordMs + holdTotal),
  );
  return {wordMs, linePauseMs: LINE_PAUSE_MS, totalMs, wordCount, lineCount};
}

export function nextLyricSectionIndex(sections: Array<{lyrics: string[]}>, current: number): number {
  const next = current + 1;
  const visible = sections.findIndex((section, index) => index >= next && section.lyrics.length > 0);
  return visible >= 0 ? visible : sections.length;
}
