import type {SongSeedSyncedLyricLine} from '../native/songSeedApi';

export type SongIdeaLyricTiming = {
  lineIndex: number;
  startSeconds: number;
  endSeconds?: number;
};

export type SongIdeaTimedSection = {
  bars: number;
  lyricTimings?: SongIdeaLyricTiming[];
};

export type SongIdeaSectionBeatRange = {
  startBeat: number;
  endBeat: number;
};

const UNTIL_NEXT_LINE_TAIL_BEATS = 4;

function fixedBeat(value: number): number {
  return Number(Math.max(0, value).toFixed(6));
}

export function beatFromSyncedSeconds(seconds: number, bpm: number): number {
  return fixedBeat((seconds * bpm) / 60);
}

function cleanMatchText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function lineMatches(target: string, candidate: string): boolean {
  if (!target || !candidate) return false;
  if (target === candidate) return true;
  return target.length >= 8 && candidate.includes(target)
    || candidate.length >= 8 && target.includes(candidate);
}

function normalizeSyncedLines(lines: SongSeedSyncedLyricLine[] | undefined) {
  return (lines ?? [])
    .filter(line => line.text && Number.isFinite(line.startSeconds))
    .map(line => ({
      ...line,
      matchText: cleanMatchText(line.text),
    }))
    .filter(line => line.matchText)
    .sort((left, right) => left.startSeconds - right.startSeconds);
}

export function alignSyncedLyricTimings(
  lyricLines: string[],
  syncedLines: SongSeedSyncedLyricLine[] | undefined,
): Array<SongIdeaLyricTiming | undefined> {
  const providerLines = normalizeSyncedLines(syncedLines);
  const timings: Array<SongIdeaLyricTiming | undefined> = Array.from({length: lyricLines.length});
  let providerCursor = 0;
  lyricLines.forEach((line, lineIndex) => {
    const target = cleanMatchText(line);
    if (!target) return;
    const matchIndex = providerLines.findIndex((providerLine, index) => (
      index >= providerCursor && lineMatches(target, providerLine.matchText)
    ));
    if (matchIndex < 0) return;
    const match = providerLines[matchIndex]!;
    providerCursor = matchIndex + 1;
    timings[lineIndex] = {
      lineIndex,
      startSeconds: match.startSeconds,
      ...(match.endSeconds !== undefined ? {endSeconds: match.endSeconds} : {}),
    };
  });
  return timings;
}

export function timingsForLyricRange(
  timings: Array<SongIdeaLyricTiming | undefined>,
  startLine: number,
  endLine: number,
): SongIdeaLyricTiming[] {
  const sectionTimings: SongIdeaLyricTiming[] = [];
  for (let lineIndex = startLine; lineIndex <= endLine; lineIndex += 1) {
    const timing = timings[lineIndex];
    if (timing) {
      sectionTimings.push({...timing, lineIndex: lineIndex - startLine});
    }
  }
  return sectionTimings;
}

function timedStart(section: SongIdeaTimedSection, bpm: number): number | undefined {
  const starts = (section.lyricTimings ?? []).map(timing => beatFromSyncedSeconds(timing.startSeconds, bpm));
  return starts.length > 0 ? Math.min(...starts) : undefined;
}

function timedEnd(section: SongIdeaTimedSection, bpm: number): number | undefined {
  const ends = (section.lyricTimings ?? []).map(timing => (
    beatFromSyncedSeconds(timing.endSeconds ?? timing.startSeconds, bpm)
    + (timing.endSeconds === undefined ? UNTIL_NEXT_LINE_TAIL_BEATS : 0)
  ));
  return ends.length > 0 ? Math.max(...ends) : undefined;
}

function nextTimedStart(sections: SongIdeaTimedSection[], index: number, bpm: number): number | undefined {
  for (let cursor = index + 1; cursor < sections.length; cursor += 1) {
    const start = timedStart(sections[cursor]!, bpm);
    if (start !== undefined) return start;
  }
  return undefined;
}

export function sectionBeatRangesFromTimings(
  sections: SongIdeaTimedSection[],
  bpm: number,
): SongIdeaSectionBeatRange[] {
  let cursor = 0;
  return sections.map((section, index) => {
    const fallbackLength = Math.max(1, section.bars * 4);
    const startBeat = fixedBeat(timedStart(section, bpm) ?? cursor);
    const nextStart = nextTimedStart(sections, index, bpm);
    const sectionEnd = timedEnd(section, bpm);
    const endBeat = fixedBeat(nextStart ?? sectionEnd ?? startBeat + fallbackLength);
    const safeEndBeat = endBeat > startBeat ? endBeat : fixedBeat(startBeat + Math.min(fallbackLength, 4));
    cursor = safeEndBeat;
    return {startBeat, endBeat: safeEndBeat};
  });
}
