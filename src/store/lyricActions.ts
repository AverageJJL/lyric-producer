import type {TempoMapEvent} from '../transport/tempoMap';
import {emptyTimedLyricLine, lyricBeatSecondsAfter, lyricLineStartAfterInsert, lyricSectionStartAfterPrevious} from './lyricTimingDefaults';
import {
  cloneLyricDocument,
  defaultLyricDocument,
  emptyLyricLine,
  estimateSectionLineTimings,
  lyricEntityId,
  normalizeLyricDocument,
  normalizeLyricSimilarityReport,
  splitLyricWords,
  type LyricDocument,
  type LyricSimilarityReport,
} from './lyrics';

type LyricActionState = {lyrics: LyricDocument; bpm: number; tempoMap: TempoMapEvent[]; playheadBeat: number};

type LyricSet = (partial: Partial<LyricActionState> | ((state: LyricActionState) => Partial<LyricActionState>)) => void;

type LyricGet<T extends LyricActionState> = () => T;

export type LyricActions = {
  setLyrics: (lyrics: LyricDocument) => void;
  addLyricSection: (afterSectionId?: string) => string;
  removeLyricSection: (sectionId: string) => void;
  renameLyricSection: (sectionId: string, name: string) => void;
  setLyricSectionTiming: (sectionId: string, field: 'startBeat' | 'endBeat', beat: number | undefined) => void;
  addLyricLine: (sectionId: string, afterLineId?: string) => string | null;
  removeLyricLine: (sectionId: string, lineId: string) => void;
  updateLyricLineText: (sectionId: string, lineId: string, text: string) => void;
  setLyricLineTiming: (sectionId: string, lineId: string, beat: number | undefined) => void;
  stampLyricSectionStart: (sectionId: string) => void;
  stampLyricLine: (sectionId: string, lineId: string) => void;
  estimateLyricSectionTimings: (sectionId: string) => void;
  syncLyricTimings: () => void;
  setLyricSimilarityReport: (report: LyricSimilarityReport | null) => void;
};

const MIN_LINE_BEATS = 2;
const BEATS_PER_WORD = 0.75;

function sameDocument(left: LyricDocument, right: LyricDocument): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function withLyrics<T extends LyricActionState>(
  get: LyricGet<T>,
  set: LyricSet,
  recordHistory: () => void,
  updater: (lyrics: LyricDocument) => LyricDocument,
): void {
  const current = normalizeLyricDocument(get().lyrics);
  const next = normalizeLyricDocument(updater(cloneLyricDocument(current)));
  if (sameDocument(current, next)) {
    return;
  }
  recordHistory();
  set({lyrics: next});
}

function sectionLabel(count: number): string {
  return `[Section ${count + 1}]`;
}

function setOptionalBeat<T extends {startBeat?: number; endBeat?: number}>(
  target: T,
  key: 'startBeat' | 'endBeat',
  beat: number | undefined,
): T {
  const next = {...target};
  if (beat === undefined || !Number.isFinite(beat) || beat < 0) {
    delete next[key];
  } else {
    next[key] = Number(beat.toFixed(6));
  }
  return next;
}

function updateSection(
  lyrics: LyricDocument,
  sectionId: string,
  updater: (section: LyricDocument['sections'][number], index: number) => LyricDocument['sections'][number],
): LyricDocument {
  return {
    ...lyrics,
    sections: lyrics.sections.map((section, index) =>
      section.id === sectionId ? updater(section, index) : section,
    ),
  };
}

function lineIndex(lines: LyricDocument['sections'][number]['lines'], lineId?: string): number {
  if (!lineId) return lines.length - 1;
  const index = lines.findIndex(line => line.id === lineId);
  return index >= 0 ? index : lines.length - 1;
}

function lineDuration(line: LyricDocument['sections'][number]['lines'][number]): number {
  return Math.max(MIN_LINE_BEATS, splitLyricWords(line.text).length * BEATS_PER_WORD);
}

function syncTimings(document: LyricDocument): LyricDocument {
  let cursor = 0;
  return {
    ...document,
    sections: document.sections.map(section => {
      const durations = section.lines.map(lineDuration);
      const sectionStart = cursor;
      let lineCursor = sectionStart;
      const lines = section.lines.map((line, index) => {
        const next = {
          ...line,
          startBeat: Number(lineCursor.toFixed(6)),
          timingSource: 'estimated' as const,
        };
        lineCursor += durations[index] ?? MIN_LINE_BEATS;
        return next;
      });
      cursor = lineCursor;
      return {
        ...section,
        startBeat: Number(sectionStart.toFixed(6)),
        endBeat: Number(cursor.toFixed(6)),
        lines,
      };
    }),
  };
}

export function createLyricActions<T extends LyricActionState>(
  get: LyricGet<T>,
  set: LyricSet,
  recordHistory: () => void,
): LyricActions {
  return {
    setLyrics: lyrics => withLyrics(get, set, recordHistory, () => normalizeLyricDocument(lyrics)),

    addLyricSection: afterSectionId => {
      const id = lyricEntityId('lyric-section');
      const {bpm, tempoMap} = get();
      withLyrics(get, set, recordHistory, lyrics => {
        const index = afterSectionId
          ? lyrics.sections.findIndex(item => item.id === afterSectionId)
          : lyrics.sections.length - 1;
        const insertAt = Math.max(0, index + 1);
        const startBeat = lyricSectionStartAfterPrevious(
          insertAt > 0 ? lyrics.sections[insertAt - 1] : undefined,
          bpm,
          tempoMap,
        );
        const section = {
          id,
          name: sectionLabel(lyrics.sections.length),
          ...(startBeat === undefined ? {} : {startBeat}),
          lines: [emptyLyricLine(startBeat)],
        };
        return {
          ...lyrics,
          sections: [
            ...lyrics.sections.slice(0, insertAt),
            section,
            ...lyrics.sections.slice(insertAt),
          ],
        };
      });
      return id;
    },

    removeLyricSection: sectionId => withLyrics(get, set, recordHistory, lyrics => {
      const sections = lyrics.sections.filter(section => section.id !== sectionId);
      return sections.length > 0 ? {...lyrics, sections} : defaultLyricDocument();
    }),

    renameLyricSection: (sectionId, name) => withLyrics(get, set, recordHistory, lyrics =>
      updateSection(lyrics, sectionId, (section, index) => ({
        ...section,
        name: name.trim() || sectionLabel(index),
      })),
    ),

    setLyricSectionTiming: (sectionId, field, beat) => withLyrics(get, set, recordHistory, lyrics =>
      updateSection(lyrics, sectionId, section => {
        const next = setOptionalBeat(section, field, beat);
        const first = next.lines[0];
        if (field !== 'startBeat' || next.startBeat === undefined || !first || first.timingSource === 'manual') return next;
        return {...next, lines: [{...first, startBeat: next.startBeat, timingSource: 'estimated'}, ...next.lines.slice(1)]};
      }),
    ),

    addLyricLine: (sectionId, afterLineId) => {
      const id = lyricEntityId('lyric-line');
      let inserted = false;
      const {bpm, tempoMap} = get();
      withLyrics(get, set, recordHistory, lyrics =>
        updateSection(lyrics, sectionId, section => {
          const insertAt = lineIndex(section.lines, afterLineId) + 1;
          inserted = true;
          const startBeat = lyricLineStartAfterInsert(section, insertAt, bpm, tempoMap);
          return {
            ...section,
            lines: [
              ...section.lines.slice(0, insertAt),
              emptyTimedLyricLine(id, startBeat),
              ...section.lines.slice(insertAt),
            ],
          };
        }),
      );
      return inserted ? id : null;
    },

    removeLyricLine: (sectionId, lineId) => withLyrics(get, set, recordHistory, lyrics =>
      updateSection(lyrics, sectionId, section => {
        const lines = section.lines.filter(line => line.id !== lineId);
        return {...section, lines: lines.length > 0 ? lines : [emptyLyricLine(section.startBeat)]};
      }),
    ),

    updateLyricLineText: (sectionId, lineId, text) => withLyrics(get, set, recordHistory, lyrics =>
      updateSection(lyrics, sectionId, section => {
        const {bpm, tempoMap} = get();
        const parts = text.replace(/\r\n/g, '\n').split('\n');
        if (parts.length <= 1) {
          return {
            ...section,
            lines: section.lines.map(line => line.id === lineId ? {...line, text} : line),
          };
        }
        const replaceAt = section.lines.findIndex(line => line.id === lineId);
        if (replaceAt < 0) return section;
        const first = {...section.lines[replaceAt]!, text: parts[0] ?? ''};
        let cursor = first.startBeat;
        const inserted = parts.slice(1).map(part => {
          cursor = cursor === undefined ? undefined : lyricBeatSecondsAfter(cursor, 1, bpm, tempoMap);
          return cursor === undefined
            ? {id: lyricEntityId('lyric-line'), text: part, timingSource: 'unset' as const}
            : {id: lyricEntityId('lyric-line'), text: part, startBeat: cursor, timingSource: 'estimated' as const};
        });
        return {
          ...section,
          lines: [
            ...section.lines.slice(0, replaceAt),
            first,
            ...inserted,
            ...section.lines.slice(replaceAt + 1),
          ],
        };
      }),
    ),

    setLyricLineTiming: (sectionId, lineId, beat) => withLyrics(get, set, recordHistory, lyrics =>
      updateSection(lyrics, sectionId, section => ({
        ...section,
        lines: section.lines.map(line => {
          if (line.id !== lineId) return line;
          const next = setOptionalBeat(line, 'startBeat', beat);
          return {...next, timingSource: beat === undefined ? 'unset' : 'manual'};
        }),
      })),
    ),

    stampLyricSectionStart: sectionId => {
      const beat = get().playheadBeat;
      withLyrics(get, set, recordHistory, lyrics =>
        updateSection(lyrics, sectionId, section => ({...section, startBeat: Number(beat.toFixed(6))})),
      );
    },

    stampLyricLine: (sectionId, lineId) => {
      const beat = get().playheadBeat;
      withLyrics(get, set, recordHistory, lyrics =>
        updateSection(lyrics, sectionId, section => ({
          ...section,
          lines: section.lines.map(line =>
            line.id === lineId
              ? {...line, startBeat: Number(beat.toFixed(6)), timingSource: 'manual'}
              : line,
          ),
        })),
      );
    },

    estimateLyricSectionTimings: sectionId => withLyrics(get, set, recordHistory, lyrics =>
      estimateSectionLineTimings(lyrics, sectionId),
    ),

    syncLyricTimings: () => withLyrics(get, set, recordHistory, syncTimings),

    setLyricSimilarityReport: report => withLyrics(get, set, recordHistory, lyrics => ({
      ...lyrics,
      similarityReport: report ? normalizeLyricSimilarityReport(report) : null,
    })),
  };
}
