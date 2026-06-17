import {
  tempoMapBpmAtBeat,
  tempoMapSecondsBetweenBeats,
} from './tempoMapTiming';
import type {TempoMapEvent} from './tempoMap';

export const RECORDING_COUNT_IN_OPTIONS = [0, 4, 8] as const;
export const RECORDING_PRE_ROLL_OPTIONS = [0, 4, 8] as const;
export const AUTO_RECORDING_LATENCY_COMPENSATION_MS = -1;
export const RECORDING_LATENCY_COMPENSATION_MS_OPTIONS = [
  AUTO_RECORDING_LATENCY_COMPENSATION_MS,
  0,
  10,
  25,
  50,
  100,
] as const;

export type RecordingCountInBeats = (typeof RECORDING_COUNT_IN_OPTIONS)[number];
export type RecordingPreRollBeats = (typeof RECORDING_PRE_ROLL_OPTIONS)[number];
export type RecordingLatencyCompensationMs =
  (typeof RECORDING_LATENCY_COMPENSATION_MS_OPTIONS)[number];

export const DEFAULT_RECORDING_COUNT_IN_BEATS: RecordingCountInBeats = 4;
export const DEFAULT_RECORDING_PRE_ROLL_BEATS: RecordingPreRollBeats = 0;
export const DEFAULT_RECORDING_LATENCY_COMPENSATION_MS: RecordingLatencyCompensationMs = 0;

export function normalizeRecordingCountInBeats(value: unknown): RecordingCountInBeats {
  return RECORDING_COUNT_IN_OPTIONS.includes(value as RecordingCountInBeats)
    ? value as RecordingCountInBeats
    : DEFAULT_RECORDING_COUNT_IN_BEATS;
}

export function normalizeRecordingPreRollBeats(value: unknown): RecordingPreRollBeats {
  return RECORDING_PRE_ROLL_OPTIONS.includes(value as RecordingPreRollBeats)
    ? value as RecordingPreRollBeats
    : DEFAULT_RECORDING_PRE_ROLL_BEATS;
}

export function normalizeRecordingLatencyCompensationMs(
  value: unknown,
): RecordingLatencyCompensationMs {
  return RECORDING_LATENCY_COMPENSATION_MS_OPTIONS.includes(value as RecordingLatencyCompensationMs)
    ? value as RecordingLatencyCompensationMs
    : DEFAULT_RECORDING_LATENCY_COMPENSATION_MS;
}

export function isAutoRecordingLatencyCompensationMs(
  value: unknown,
): value is typeof AUTO_RECORDING_LATENCY_COMPENSATION_MS {
  return value === AUTO_RECORDING_LATENCY_COMPENSATION_MS;
}

export function resolvedRecordingLatencyCompensationMs(
  preference: RecordingLatencyCompensationMs,
  nativeMilliseconds: unknown,
): number {
  if (!isAutoRecordingLatencyCompensationMs(preference)) {
    return Math.max(0, preference);
  }

  return Math.max(0, Number.isFinite(nativeMilliseconds as number)
    ? nativeMilliseconds as number
    : 0);
}

export function recordingCountInSeconds(
  countInBeats: number,
  bpm: number,
  tempoMap: TempoMapEvent[] = [],
  recordStartBeat = 0,
): number {
  const safeBeats = Math.max(0, Number.isFinite(countInBeats) ? countInBeats : 0);
  const anchorBeat = Number.isFinite(recordStartBeat) ? Math.max(0, recordStartBeat) : 0;
  const anchorBpm = tempoMapBpmAtBeat(anchorBeat, bpm, tempoMap);
  const secondsPerBeat = anchorBpm > 0 ? 60 / anchorBpm : 0.5;
  return safeBeats * secondsPerBeat;
}

export function recordingPreRollSeconds(
  preRollBeats: number,
  bpm: number,
  tempoMap: TempoMapEvent[] = [],
  recordStartBeat = preRollBeats,
): number {
  const safeBeats = Math.max(0, Number.isFinite(preRollBeats) ? preRollBeats : 0);
  const endBeat = Number.isFinite(recordStartBeat) ? Math.max(0, recordStartBeat) : safeBeats;
  const startBeat = Math.max(0, endBeat - safeBeats);
  const clampedSeconds = tempoMapSecondsBetweenBeats(startBeat, endBeat, bpm, tempoMap);
  const clippedBeats = safeBeats - (endBeat - startBeat);
  if (clippedBeats <= 0) {
    return clampedSeconds;
  }

  return clampedSeconds + recordingCountInSeconds(clippedBeats, bpm, tempoMap, 0);
}

export function recordingBeatRangeSeconds(
  startBeat: number,
  endBeat: number,
  bpm: number,
  tempoMap: TempoMapEvent[] = [],
): number {
  return Math.max(0, tempoMapSecondsBetweenBeats(startBeat, endBeat, bpm, tempoMap));
}

export function recordingLatencyCompensationBeats(
  milliseconds: number,
  bpm: number,
  tempoMap: TempoMapEvent[] = [],
  anchorBeat = 0,
): number {
  const safeMs = Math.max(0, Number.isFinite(milliseconds) ? milliseconds : 0);
  const safeBpm = tempoMapBpmAtBeat(anchorBeat, bpm, tempoMap);
  return (safeMs / 1000) / (60 / safeBpm);
}
