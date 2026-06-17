import {
  MIN_PROJECT_BPM,
  normalizeMapBeat,
  normalizeTempoBpm,
  normalizeTempoMap,
  tempoMapEventId,
  type TempoMapEvent,
} from './tempoMap';

function safeBaseBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? normalizeTempoBpm(bpm) : 120;
}

type TimingEventsCacheEntry = {
  sourceEvents: Array<Pick<TempoMapEvent, 'beat' | 'bpm' | 'id' | 'ramp'>>;
  timingEvents: TempoMapEvent[];
};

const timingEventsCache = new WeakMap<TempoMapEvent[], Map<number, TimingEventsCacheEntry>>();

function cloneTempoEventSources(
  events: TempoMapEvent[],
): Array<Pick<TempoMapEvent, 'beat' | 'bpm' | 'id' | 'ramp'>> {
  return events.map(event => ({
    beat: event.beat,
    bpm: event.bpm,
    id: event.id,
    ramp: event.ramp,
  }));
}

function sameTempoEventSources(
  events: TempoMapEvent[],
  sources: Array<Pick<TempoMapEvent, 'beat' | 'bpm' | 'id' | 'ramp'>>,
): boolean {
  if (events.length !== sources.length) {
    return false;
  }
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index]!;
    const source = sources[index]!;
    if (
      event.beat !== source.beat
      || event.bpm !== source.bpm
      || event.id !== source.id
      || event.ramp !== source.ramp
    ) {
      return false;
    }
  }
  return true;
}

function normalizedTimingEvents(bpm: number, events: TempoMapEvent[]): TempoMapEvent[] {
  const baseBpm = safeBaseBpm(bpm);
  const cachedByBpm = timingEventsCache.get(events);
  const cached = cachedByBpm?.get(baseBpm);
  if (cached && sameTempoEventSources(events, cached.sourceEvents)) {
    return cached.timingEvents;
  }

  const timingEvents = normalizeTempoMap([
    {id: tempoMapEventId(0), beat: 0, bpm: baseBpm, ramp: 'jump'},
    ...normalizeTempoMap(events),
  ]);
  const nextByBpm = cachedByBpm ?? new Map<number, TimingEventsCacheEntry>();
  nextByBpm.set(baseBpm, {
    sourceEvents: cloneTempoEventSources(events),
    timingEvents,
  });
  if (!cachedByBpm) {
    timingEventsCache.set(events, nextByBpm);
  }
  return timingEvents;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function linearTempoSeconds(
  localStartBeat: number,
  localEndBeat: number,
  segmentLengthBeats: number,
  startBpm: number,
  endBpm: number,
): number {
  if (segmentLengthBeats <= 0 || Math.abs(endBpm - startBpm) < 0.0001) {
    return (localEndBeat - localStartBeat) * (60 / startBpm);
  }

  const slope = (endBpm - startBpm) / segmentLengthBeats;
  const startTempo = Math.max(MIN_PROJECT_BPM, startBpm + slope * localStartBeat);
  const endTempo = Math.max(MIN_PROJECT_BPM, startBpm + slope * localEndBeat);
  return (60 / slope) * Math.log(endTempo / startTempo);
}

function segmentSeconds(
  startBeat: number,
  endBeat: number,
  event: TempoMapEvent,
  nextEvent?: TempoMapEvent,
): number {
  if (endBeat <= startBeat) {
    return 0;
  }

  if (!nextEvent || event.ramp !== 'linear') {
    return (endBeat - startBeat) * (60 / event.bpm);
  }

  return linearTempoSeconds(
    startBeat - event.beat,
    endBeat - event.beat,
    nextEvent.beat - event.beat,
    event.bpm,
    nextEvent.bpm,
  );
}

export function tempoMapBpmAtBeat(
  beat: number,
  bpm: number,
  events: TempoMapEvent[],
): number {
  const safeBeat = finiteNonNegative(beat);
  const timingEvents = normalizedTimingEvents(bpm, events);
  let current = timingEvents[0];
  let next = timingEvents[1];

  for (let index = 0; index < timingEvents.length; index += 1) {
    const candidate = timingEvents[index];
    if (candidate.beat > safeBeat) {
      break;
    }
    current = candidate;
    next = timingEvents[index + 1];
  }

  if (!next || current.ramp !== 'linear' || next.beat <= current.beat) {
    return current.bpm;
  }

  const progress = Math.max(0, Math.min(1, (safeBeat - current.beat) / (next.beat - current.beat)));
  return normalizeTempoBpm(current.bpm + (next.bpm - current.bpm) * progress);
}

export function tempoMapSecondsBetweenBeats(
  startBeat: number,
  endBeat: number,
  bpm: number,
  events: TempoMapEvent[],
): number {
  const safeStart = finiteNonNegative(startBeat);
  const safeEnd = finiteNonNegative(endBeat);
  if (safeStart === safeEnd) {
    return 0;
  }

  const direction = safeEnd >= safeStart ? 1 : -1;
  const rangeStart = Math.min(safeStart, safeEnd);
  const rangeEnd = Math.max(safeStart, safeEnd);
  const timingEvents = normalizedTimingEvents(bpm, events);
  let seconds = 0;

  for (let index = 0; index < timingEvents.length; index += 1) {
    const event = timingEvents[index];
    const nextEvent = timingEvents[index + 1];
    const segmentStart = Math.max(rangeStart, event.beat);
    const segmentEnd = Math.min(rangeEnd, nextEvent?.beat ?? rangeEnd);

    if (segmentEnd > segmentStart) {
      seconds += segmentSeconds(segmentStart, segmentEnd, event, nextEvent);
    }

    if (!nextEvent || nextEvent.beat >= rangeEnd) {
      break;
    }
  }

  return direction * seconds;
}

export function tempoMapSecondsAtBeat(
  beat: number,
  bpm: number,
  events: TempoMapEvent[],
): number {
  return tempoMapSecondsBetweenBeats(0, beat, bpm, events);
}

function solveLinearTempoBeatOffset(
  seconds: number,
  segmentLengthBeats: number,
  startBpm: number,
  endBpm: number,
): number {
  if (segmentLengthBeats <= 0 || Math.abs(endBpm - startBpm) < 0.0001) {
    return seconds / (60 / startBpm);
  }

  const slope = (endBpm - startBpm) / segmentLengthBeats;
  return (startBpm * (Math.exp((seconds * slope) / 60) - 1)) / slope;
}

export function tempoMapBeatAtSeconds(
  seconds: number,
  bpm: number,
  events: TempoMapEvent[],
): number {
  let remainingSeconds = finiteNonNegative(seconds);
  const timingEvents = normalizedTimingEvents(bpm, events);

  for (let index = 0; index < timingEvents.length; index += 1) {
    const event = timingEvents[index];
    const nextEvent = timingEvents[index + 1];
    const segmentLength = nextEvent ? nextEvent.beat - event.beat : Number.POSITIVE_INFINITY;
    const segmentDuration =
      nextEvent && event.ramp === 'linear'
        ? segmentSeconds(event.beat, nextEvent.beat, event, nextEvent)
        : segmentLength * (60 / event.bpm);

    if (remainingSeconds <= segmentDuration || !Number.isFinite(segmentDuration)) {
      const localBeat =
        nextEvent && event.ramp === 'linear'
          ? solveLinearTempoBeatOffset(remainingSeconds, segmentLength, event.bpm, nextEvent.bpm)
          : remainingSeconds / (60 / event.bpm);
      return normalizeMapBeat(event.beat + Math.max(0, localBeat));
    }

    remainingSeconds -= segmentDuration;
  }

  return 0;
}
