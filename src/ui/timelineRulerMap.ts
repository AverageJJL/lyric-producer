import type {TimeSignature} from '../store/projectMetadata';
import {
  beatsPerBarForTimeSignature,
  normalizeTimeSignature,
} from '../store/projectMetadata';
import {
  normalizeMeterMap,
  normalizeTempoMap,
  type MeterMapEvent,
  type TempoMapEvent,
} from '../transport/tempoMap';
import {displayGridStepBeats, type SnapGrid} from './snapGrid';

type TimelineRulerInput = {
  visibleTimelineBeats: number;
  snapGrid: SnapGrid;
  timeSignature: TimeSignature;
  meterMap: MeterMapEvent[];
  tempoMap: TempoMapEvent[];
};

export type TimelineGridLine = {
  beat: number;
  kind: 'bar' | 'beat' | 'subdivision';
};

export type TimelineRulerTick = {
  beat: number;
  label: string | null;
  isBar: boolean;
};

export type TimelineMapMarker = {
  id: string;
  beat: number;
  label: string;
  type: 'tempo' | 'meter';
  isRamp?: boolean;
};

export type TimelineRulerModel = {
  rulerTicks: TimelineRulerTick[];
  gridLines: TimelineGridLine[];
  mapMarkers: TimelineMapMarker[];
};

type MeterSegment = {
  beat: number;
  timeSignature: TimeSignature;
};

const EPSILON = 1e-6;

function beatKey(beat: number): string {
  return beat.toFixed(6);
}

function normalizeBeat(beat: number): number {
  return Number(Math.max(0, beat).toFixed(6));
}

function beatWithin(beat: number, visibleTimelineBeats: number): boolean {
  return beat >= -EPSILON && beat <= visibleTimelineBeats + EPSILON;
}

function meterSegments(
  timeSignature: TimeSignature,
  meterMap: MeterMapEvent[],
): MeterSegment[] {
  const events = normalizeMeterMap(meterMap);
  const base = normalizeTimeSignature(timeSignature);
  const hasZeroEvent = events.some(event => Math.abs(event.beat) < EPSILON);
  const segments = hasZeroEvent
    ? events
    : [{id: 'meter-base', beat: 0, timeSignature: base}, ...events];
  return segments.map(event => ({
    beat: normalizeBeat(event.beat),
    timeSignature: event.timeSignature,
  }));
}

function beatsPerMappedBar(timeSignature: TimeSignature): number {
  return beatsPerBarForTimeSignature(timeSignature);
}

function mappedBarStarts(
  visibleTimelineBeats: number,
  timeSignature: TimeSignature,
  meterMap: MeterMapEvent[],
): Array<{beat: number; label: string}> {
  const visible = Math.max(0, visibleTimelineBeats);
  const segments = meterSegments(timeSignature, meterMap);
  const bars: Array<{beat: number; label: string}> = [];
  let barNumber = 1;

  segments.forEach((segment, index) => {
    const nextStart = segments[index + 1]?.beat ?? visible + beatsPerMappedBar(segment.timeSignature);
    const step = beatsPerMappedBar(segment.timeSignature);
    let beat = segment.beat;

    while (beatWithin(beat, visible) && beat < nextStart - EPSILON) {
      bars.push({beat: normalizeBeat(beat), label: String(barNumber)});
      beat += step;
      barNumber += 1;
    }

  });

  return bars;
}

function rulerTicks(
  visibleTimelineBeats: number,
  bars: Array<{beat: number; label: string}>,
): TimelineRulerTick[] {
  const visible = Math.max(0, Math.floor(visibleTimelineBeats));
  const ticks: TimelineRulerTick[] = [];
  let barIndex = 0;

  for (let beat = 0; beat <= visible; beat += 1) {
    while (barIndex < bars.length && bars[barIndex].beat < beat) {
      ticks.push({
        beat: bars[barIndex].beat,
        label: bars[barIndex].label,
        isBar: true,
      });
      barIndex += 1;
    }

    if (barIndex < bars.length && beatKey(bars[barIndex].beat) === beatKey(beat)) {
      ticks.push({
        beat: bars[barIndex].beat,
        label: bars[barIndex].label,
        isBar: true,
      });
      barIndex += 1;
    } else {
      ticks.push({beat, label: null, isBar: false});
    }
  }

  while (barIndex < bars.length) {
    ticks.push({
      beat: bars[barIndex].beat,
      label: bars[barIndex].label,
      isBar: true,
    });
    barIndex += 1;
  }

  return ticks;
}

function gridLines(
  visibleTimelineBeats: number,
  snapGrid: SnapGrid,
  bars: Array<{beat: number; label: string}>,
): TimelineGridLine[] {
  if (snapGrid === 'bar') {
    return bars.map(bar => ({beat: bar.beat, kind: 'bar'}));
  }

  const step = displayGridStepBeats(snapGrid, 4);
  const count = Math.floor(Math.max(0, visibleTimelineBeats) / step) + 1;
  const lines: TimelineGridLine[] = [];
  let barIndex = 0;

  for (let index = 0; index < count; index += 1) {
    const beat = normalizeBeat(index * step);
    while (barIndex < bars.length && bars[barIndex].beat < beat) {
      lines.push({beat: bars[barIndex].beat, kind: 'bar'});
      barIndex += 1;
    }

    if (barIndex < bars.length && beatKey(bars[barIndex].beat) === beatKey(beat)) {
      lines.push({beat: bars[barIndex].beat, kind: 'bar'});
      barIndex += 1;
    } else {
      lines.push({
        beat,
        kind: Number.isInteger(beat) ? 'beat' : 'subdivision',
      });
    }
  }

  while (barIndex < bars.length) {
    lines.push({beat: bars[barIndex].beat, kind: 'bar'});
    barIndex += 1;
  }

  return lines;
}

function mapMarkers(input: TimelineRulerInput): TimelineMapMarker[] {
  const tempoMarkers = normalizeTempoMap(input.tempoMap)
    .filter(event => beatWithin(event.beat, input.visibleTimelineBeats))
    .map(event => ({
      id: event.id,
      beat: event.beat,
      label: String(event.bpm),
      type: 'tempo' as const,
      isRamp: event.ramp === 'linear',
    }));
  const meterMarkers = normalizeMeterMap(input.meterMap)
    .filter(event => beatWithin(event.beat, input.visibleTimelineBeats))
    .map(event => ({
      id: event.id,
      beat: event.beat,
      label: `${event.timeSignature.numerator}/${event.timeSignature.denominator}`,
      type: 'meter' as const,
    }));
  const markers: TimelineMapMarker[] = [];
  let tempoIndex = 0;
  let meterIndex = 0;

  while (tempoIndex < tempoMarkers.length || meterIndex < meterMarkers.length) {
    const tempo = tempoMarkers[tempoIndex];
    const meter = meterMarkers[meterIndex];
    if (tempo && (!meter || tempo.beat <= meter.beat)) {
      markers.push(tempo);
      tempoIndex += 1;
    } else if (meter) {
      markers.push(meter);
      meterIndex += 1;
    }
  }

  return markers;
}

export function buildTimelineRulerModel(input: TimelineRulerInput): TimelineRulerModel {
  const bars = mappedBarStarts(
    input.visibleTimelineBeats,
    input.timeSignature,
    input.meterMap,
  );

  return {
    rulerTicks: rulerTicks(input.visibleTimelineBeats, bars),
    gridLines: gridLines(input.visibleTimelineBeats, input.snapGrid, bars),
    mapMarkers: mapMarkers(input),
  };
}
