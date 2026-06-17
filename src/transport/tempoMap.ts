import {
  normalizeTimeSignature,
  type TimeSignature,
} from '../store/projectMetadata';

export const MIN_PROJECT_BPM = 20;
export const MAX_PROJECT_BPM = 300;

export type TempoMapRamp = 'jump' | 'linear';

export type TempoMapEvent = {
  id: string;
  beat: number;
  bpm: number;
  ramp: TempoMapRamp;
};

export type MeterMapEvent = {
  id: string;
  beat: number;
  timeSignature: TimeSignature;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function normalizeTempoBpm(value: number): number {
  if (!Number.isFinite(value)) {
    return 120;
  }
  return Math.max(MIN_PROJECT_BPM, Math.min(MAX_PROJECT_BPM, Math.round(value)));
}

export function normalizeMapBeat(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.round(Math.max(0, value) * 1000) / 1000;
}

export function normalizeTempoRamp(value: unknown): TempoMapRamp {
  return value === 'linear' ? 'linear' : 'jump';
}

function beatKey(beat: number): string {
  return normalizeMapBeat(beat).toFixed(3);
}

function eventId(prefix: string, beat: number): string {
  return `${prefix}-${beatKey(beat).replace('.', '_')}`;
}

export function tempoMapEventId(beat: number): string {
  return eventId('tempo', beat);
}

export function meterMapEventId(beat: number): string {
  return eventId('meter', beat);
}

export function normalizeTempoMap(events: unknown): TempoMapEvent[] {
  if (!Array.isArray(events)) {
    return [];
  }

  const byBeat = new Map<string, TempoMapEvent>();
  events.forEach(event => {
    if (!isRecord(event)) {
      return;
    }
    const beat = finiteNumber(event.beat);
    const bpm = finiteNumber(event.bpm);
    if (beat === null || bpm === null) {
      return;
    }
    const normalizedBeat = normalizeMapBeat(beat);
    byBeat.set(beatKey(normalizedBeat), {
      id: typeof event.id === 'string' && event.id.trim()
        ? event.id.trim()
        : tempoMapEventId(normalizedBeat),
      beat: normalizedBeat,
      bpm: normalizeTempoBpm(bpm),
      ramp: normalizeTempoRamp(event.ramp),
    });
  });

  return [...byBeat.values()].sort((left, right) => left.beat - right.beat);
}

export function normalizeMeterMap(events: unknown): MeterMapEvent[] {
  if (!Array.isArray(events)) {
    return [];
  }

  const byBeat = new Map<string, MeterMapEvent>();
  events.forEach(event => {
    if (!isRecord(event)) {
      return;
    }
    const beat = finiteNumber(event.beat);
    if (beat === null || !isRecord(event.timeSignature)) {
      return;
    }
    const normalizedBeat = normalizeMapBeat(beat);
    byBeat.set(beatKey(normalizedBeat), {
      id: typeof event.id === 'string' && event.id.trim()
        ? event.id.trim()
        : meterMapEventId(normalizedBeat),
      beat: normalizedBeat,
      timeSignature: normalizeTimeSignature(event.timeSignature as TimeSignature),
    });
  });

  return [...byBeat.values()].sort((left, right) => left.beat - right.beat);
}

export function upsertTempoMapEvent(
  events: TempoMapEvent[],
  beat: number,
  bpm: number,
  ramp: TempoMapRamp = 'jump',
): TempoMapEvent[] {
  return normalizeTempoMap([
    ...events,
    {
      id: tempoMapEventId(beat),
      beat,
      bpm,
      ramp,
    },
  ]);
}

export function removeTempoMapEventAtBeat(
  events: TempoMapEvent[],
  beat: number,
): TempoMapEvent[] {
  const key = beatKey(beat);
  return normalizeTempoMap(events).filter(event => beatKey(event.beat) !== key);
}

export function upsertMeterMapEvent(
  events: MeterMapEvent[],
  beat: number,
  timeSignature: TimeSignature,
): MeterMapEvent[] {
  return normalizeMeterMap([
    ...events,
    {
      id: meterMapEventId(beat),
      beat,
      timeSignature,
    },
  ]);
}

export function removeMeterMapEventAtBeat(
  events: MeterMapEvent[],
  beat: number,
): MeterMapEvent[] {
  const key = beatKey(beat);
  return normalizeMeterMap(events).filter(event => beatKey(event.beat) !== key);
}

export function tempoMapEventAtBeat(
  events: TempoMapEvent[],
  beat: number,
): TempoMapEvent | undefined {
  const key = beatKey(beat);
  return normalizeTempoMap(events).find(event => beatKey(event.beat) === key);
}

export function meterMapEventAtBeat(
  events: MeterMapEvent[],
  beat: number,
): MeterMapEvent | undefined {
  const key = beatKey(beat);
  return normalizeMeterMap(events).find(event => beatKey(event.beat) === key);
}
