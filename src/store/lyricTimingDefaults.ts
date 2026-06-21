import type {TempoMapEvent} from '../transport/tempoMap';
import {
  tempoMapBeatAtSeconds,
  tempoMapSecondsAtBeat,
} from '../transport/tempoMapTiming';
import type {LyricLine, LyricSection} from './lyrics';

export function lyricBeatSecondsAfter(
  beat: number,
  seconds: number,
  bpm: number,
  tempoMap: TempoMapEvent[],
): number {
  const targetSeconds = tempoMapSecondsAtBeat(beat, bpm, tempoMap) + seconds;
  return Number(tempoMapBeatAtSeconds(targetSeconds, bpm, tempoMap).toFixed(6));
}

export function lyricLineStartAfterInsert(
  section: LyricSection,
  insertAt: number,
  bpm: number,
  tempoMap: TempoMapEvent[],
): number | undefined {
  const previousBeat = section.lines[insertAt - 1]?.startBeat ?? (insertAt === 1 ? section.startBeat : undefined);
  return previousBeat === undefined ? undefined : lyricBeatSecondsAfter(previousBeat, 1, bpm, tempoMap);
}

export function lyricSectionStartAfterPrevious(
  section: LyricSection | undefined,
  bpm: number,
  tempoMap: TempoMapEvent[],
): number | undefined {
  const lastLine = section?.lines[section.lines.length - 1];
  const startBeat = lastLine?.startBeat ?? section?.startBeat;
  return startBeat === undefined ? undefined : lyricBeatSecondsAfter(startBeat, 2, bpm, tempoMap);
}

export function emptyTimedLyricLine(id: string, startBeat: number | undefined): LyricLine {
  return startBeat === undefined
    ? {id, text: '', timingSource: 'unset'}
    : {id, text: '', startBeat, timingSource: 'estimated'};
}
