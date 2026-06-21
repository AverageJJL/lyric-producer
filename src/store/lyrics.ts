import {
  tempoMapBeatAtSeconds,
  tempoMapSecondsAtBeat,
} from '../transport/tempoMapTiming';
import type {TempoMapEvent} from '../transport/tempoMap';
import {
  normalizeLyricSimilarityReport,
  type LyricSimilarityReport,
} from './lyricSimilarity';

export {normalizeLyricSimilarityReport};
export type {LyricSimilarityMatch, LyricSimilarityReport, LyricSimilarityRisk} from './lyricSimilarity';

export const LYRIC_DOCUMENT_SCHEMA_VERSION = 1;

export type LyricTimingSource = 'manual' | 'estimated' | 'unset';

export type LyricLine = {
  id: string;
  text: string;
  startBeat?: number;
  timingSource: LyricTimingSource;
};

export type LyricSection = {
  id: string;
  name: string;
  startBeat?: number;
  endBeat?: number;
  lines: LyricLine[];
};

export type LyricDocument = {schemaVersion: typeof LYRIC_DOCUMENT_SCHEMA_VERSION; sections: LyricSection[]; similarityReport: LyricSimilarityReport | null};

export type LyricHighlight = {
  sectionId: string;
  lineId: string;
  activeWordIndex: number;
  lineProgress: number;
};

const SECTION_PREFIX = 'lyric-section';
const LINE_PREFIX = 'lyric-line';
const DEFAULT_SECTION_ID = `${SECTION_PREFIX}-1`;
const DEFAULT_LINE_ID = `${LINE_PREFIX}-1`;

export function lyricEntityId(prefix: string = 'lyric'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 8)}`;
}

export function emptyLyricLine(startBeat?: number): LyricLine {
  const id = lyricEntityId(LINE_PREFIX);
  return startBeat === undefined ? {id, text: '', timingSource: 'unset'} : {id, text: '', startBeat, timingSource: 'estimated'};
}

export function defaultLyricDocument(): LyricDocument {
  return {
    schemaVersion: LYRIC_DOCUMENT_SCHEMA_VERSION,
    sections: [{id: DEFAULT_SECTION_ID, name: '[Section 1]', startBeat: 0, lines: [
      {id: DEFAULT_LINE_ID, text: '', startBeat: 0, timingSource: 'estimated'},
    ]}],
    similarityReport: null,
  };
}

function finiteBeat(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Number(value.toFixed(6))
    : undefined;
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\r\n/g, '\n') : '';
}

function timingSource(value: unknown, hasBeat: boolean): LyricTimingSource {
  return value === 'manual' || value === 'estimated'
    ? value
    : hasBeat ? 'manual' : 'unset';
}

export function normalizeLyricDocument(value: unknown): LyricDocument {
  if (!value || typeof value !== 'object') {
    return defaultLyricDocument();
  }
  const raw = value as Partial<LyricDocument>;
  const sections = Array.isArray(raw.sections)
    ? raw.sections.map((section, index) => {
        const sectionRaw = section as Partial<LyricSection>;
        const lines = Array.isArray(sectionRaw.lines)
          ? sectionRaw.lines.map((line): LyricLine => {
              const lineRaw = line as Partial<LyricLine>;
              const startBeat = finiteBeat(lineRaw.startBeat);
              return {
                id: cleanText(lineRaw.id) || lyricEntityId(LINE_PREFIX),
                text: cleanText(lineRaw.text),
                startBeat,
                timingSource: timingSource(lineRaw.timingSource, startBeat !== undefined),
              };
            })
          : [];
        const startBeat = index === 0 ? finiteBeat(sectionRaw.startBeat) ?? 0 : finiteBeat(sectionRaw.startBeat);
        const normalizedLines = lines.length > 0 ? lines : [emptyLyricLine(startBeat)];
        if (startBeat !== undefined && normalizedLines[0]?.startBeat === undefined) {
          normalizedLines[0] = {...normalizedLines[0], startBeat, timingSource: 'estimated'};
        }
        return {
          id: cleanText(sectionRaw.id) || lyricEntityId(SECTION_PREFIX),
          name: cleanText(sectionRaw.name).trim() || `[Section ${index + 1}]`,
          startBeat,
          endBeat: finiteBeat(sectionRaw.endBeat),
          lines: normalizedLines,
        };
      })
    : [];
  return {
    schemaVersion: LYRIC_DOCUMENT_SCHEMA_VERSION,
    sections: sections.length > 0 ? sections : defaultLyricDocument().sections,
    similarityReport: normalizeLyricSimilarityReport(raw.similarityReport),
  };
}

export function cloneLyricDocument(document: LyricDocument): LyricDocument {
  return {
    schemaVersion: LYRIC_DOCUMENT_SCHEMA_VERSION,
    sections: document.sections.map(section => ({
      ...section,
      lines: section.lines.map(line => ({...line})),
    })),
    similarityReport: document.similarityReport
      ? {
          ...document.similarityReport,
          matches: document.similarityReport.matches.map(match => ({
            ...match,
            matchedLineIds: [...match.matchedLineIds],
          })),
        }
      : null,
  };
}

export function hasWrittenLyricText(document: LyricDocument | undefined): boolean {
  return normalizeLyricDocument(document).sections
    .some(section => section.lines.some(line => line.text.trim().length > 0));
}

export function splitLyricWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

export function parseLyricTimeInput(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 2) return null;
  const hasMinutes = parts.length > 1;
  const secondsText = parts.pop() ?? '';
  const minutes = parts.length ? Number(parts[0]) : 0;
  const seconds = Number(secondsText);
  if (
    !Number.isInteger(minutes)
    || !Number.isFinite(seconds)
    || minutes < 0
    || seconds < 0
    || (hasMinutes && seconds >= 60)
  ) {
    return null;
  }
  return minutes * 60 + seconds;
}

export function formatLyricTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '';
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const remaining = safe - minutes * 60;
  return `${minutes}:${remaining.toFixed(2).padStart(5, '0')}`;
}

export function beatToLyricTimeInput(
  beat: number | undefined,
  bpm: number,
  tempoMap: TempoMapEvent[],
): string {
  return beat === undefined ? '' : formatLyricTime(tempoMapSecondsAtBeat(beat, bpm, tempoMap));
}

export function lyricTimeInputToBeat(
  value: string,
  bpm: number,
  tempoMap: TempoMapEvent[],
): number | undefined {
  const seconds = parseLyricTimeInput(value);
  return seconds === null ? undefined : Number(tempoMapBeatAtSeconds(seconds, bpm, tempoMap).toFixed(6));
}

function sectionEndBeat(document: LyricDocument, sectionIndex: number): number | undefined {
  const section = document.sections[sectionIndex];
  return section?.endBeat ?? document.sections.slice(sectionIndex + 1)
    .find(next => next.startBeat !== undefined)?.startBeat;
}

export function estimateSectionLineTimings(
  document: LyricDocument,
  sectionId: string,
): LyricDocument {
  const normalized = cloneLyricDocument(document);
  const sectionIndex = normalized.sections.findIndex(section => section.id === sectionId);
  const section = normalized.sections[sectionIndex];
  if (!section || section.startBeat === undefined) return normalized;
  const endBeat = sectionEndBeat(normalized, sectionIndex);
  if (endBeat === undefined || endBeat <= section.startBeat || section.lines.length === 0) {
    return normalized;
  }
  const startBeat = section.startBeat;
  const weights = section.lines.map(line => Math.max(1, splitLyricWords(line.text).length));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let cursor = startBeat;
  section.lines = section.lines.map((line, index) => {
    const next = {...line, startBeat: Number(cursor.toFixed(6)), timingSource: 'estimated' as const};
    cursor += ((endBeat - startBeat) * weights[index]) / total;
    return next;
  });
  return normalized;
}

function timedLinesForSection(document: LyricDocument, index: number): LyricLine[] {
  const section = document.sections[index];
  if (!section) return [];
  const timed = section.lines.filter(line => line.startBeat !== undefined);
  if (timed.length > 0) return timed;
  return estimateSectionLineTimings(document, section.id).sections[index]?.lines ?? section.lines;
}

export function resolveLyricHighlight(
  document: LyricDocument,
  playheadBeat: number,
): LyricHighlight | null {
  const normalized = normalizeLyricDocument(document);
  const sectionIndex = normalized.sections.findIndex((section, index) => {
    const endBeat = sectionEndBeat(normalized, index);
    return section.startBeat !== undefined &&
      playheadBeat >= section.startBeat &&
      (endBeat === undefined || playheadBeat < endBeat);
  });
  if (sectionIndex < 0) return null;
  const section = normalized.sections[sectionIndex]!;
  const lines = timedLinesForSection(normalized, sectionIndex)
    .filter(line => line.startBeat !== undefined)
    .sort((left, right) => (left.startBeat ?? 0) - (right.startBeat ?? 0));
  if (lines.length === 0) return null;
  const activeIndex = Math.max(0, lines.findIndex((line, index) => {
    const nextBeat = lines[index + 1]?.startBeat ?? sectionEndBeat(normalized, sectionIndex);
    return playheadBeat >= (line.startBeat ?? 0) && (nextBeat === undefined || playheadBeat < nextBeat);
  }));
  const activeLine = lines[activeIndex] ?? lines[lines.length - 1]!;
  const startBeat = activeLine.startBeat ?? section.startBeat ?? playheadBeat;
  const endBeat = lines[activeIndex + 1]?.startBeat ?? sectionEndBeat(normalized, sectionIndex) ?? startBeat + 1;
  const progress = endBeat > startBeat ? Math.max(0, Math.min(1, (playheadBeat - startBeat) / (endBeat - startBeat))) : 1;
  const wordCount = Math.max(1, splitLyricWords(activeLine.text).length);
  return {
    sectionId: section.id,
    lineId: activeLine.id,
    activeWordIndex: Math.max(0, Math.min(wordCount - 1, Math.floor(progress * wordCount))),
    lineProgress: progress,
  };
}
