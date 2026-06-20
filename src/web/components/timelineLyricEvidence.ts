import type {SectionMarker} from '../../store/projectMetadata';
import type {ReferenceMoodAnalysis} from '../../store/referenceMoodAnalysis';

export type SectionAnalysis = NonNullable<SectionMarker['analysis']>;
export type AnalysedSectionMarker = SectionMarker & {analysis: SectionAnalysis};
export type InstrumentPoint = {timestamp: number; value: number};
export type InstrumentSeries = {label: string; points: InstrumentPoint[]; average: number};
export type InstrumentGraphModel = {
  sectionName: string;
  barLabel: string;
  timeLabel: string;
  duration: number;
  highlightStart: number;
  highlightEnd: number;
  series: InstrumentSeries[];
};
export type MoodEvidence = {label: string; score?: number; timeLabel: string};
export type LyricEvidenceModel = {
  sectionName: string;
  barLabel: string;
  timeLabel: string;
  moods: MoodEvidence[];
  graph: InstrumentGraphModel | null;
};
export type TimelineLyricLayout = {
  section: AnalysedSectionMarker;
  startBeat: number;
  startPx: number;
  width: number;
  evidence: LyricEvidenceModel;
};

const MIN_SCORE = 0.05;
const DEFAULT_SECTION_SECONDS_PER_BEAT = 3.75;

export function hasAnalysis(section: SectionMarker): section is AnalysedSectionMarker {
  return Boolean(section.analysis);
}

export function firstLyric(section: AnalysedSectionMarker): string {
  return section.analysis.lyrics?.[0]
    ?? section.analysis.lyricPreview?.[0]
    ?? section.analysis.meaning
    ?? '';
}

export function popoverIdFor(sectionId: string): string {
  return `lyrics-analysis-${sectionId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

export function formatEvidenceLabel(value: string): string {
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function formatTime(seconds: number): string {
  const clamped = Math.max(0, Math.round(seconds));
  return `${Math.floor(clamped / 60)}:${String(clamped % 60).padStart(2, '0')}`;
}

function average(points: InstrumentPoint[]): number {
  return points.length > 0 ? points.reduce((sum, point) => sum + point.value, 0) / points.length : 0;
}

function normalizeSeries(series: Array<{label: string; points: InstrumentPoint[]}>): InstrumentSeries[] {
  return series.map(item => ({...item, average: average(item.points)}))
    .filter(item => item.average > 0.01 && item.points.length > 0)
    .sort((left, right) => right.average - left.average)
    .slice(0, 4);
}

function instrumentSeries(reference: ReferenceMoodAnalysis): InstrumentSeries[] {
  const curved = reference.curves?.instrumentsExtended?.length
    ? reference.curves.instrumentsExtended
    : reference.curves?.instruments;
  if (curved?.length) return normalizeSeries(curved);
  const labels = Array.from(new Set(reference.segments.map(segment => segment.instrument).filter((item): item is string => Boolean(item))));
  return normalizeSeries(labels.map(label => ({
    label,
    points: reference.segments.map(segment => ({
      timestamp: segment.timestamp,
      value: segment.instrument === label ? segment.instrumentScore ?? 0 : 0,
    })),
  })));
}

function referenceDuration(reference: ReferenceMoodAnalysis | undefined, songEndBeat: number): number {
  if (!reference) return Math.max(1, songEndBeat * DEFAULT_SECTION_SECONDS_PER_BEAT);
  const curveTimes = Object.values(reference.curves ?? {})
    .flatMap(series => series.flatMap(item => item.points.map(point => point.timestamp)));
  const timestamps = [
    ...curveTimes,
    ...reference.segments.map(segment => segment.timestamp),
  ].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  const last = timestamps[timestamps.length - 1] ?? 0;
  const diffs = timestamps.slice(1).map((value, index) => value - timestamps[index]).filter(value => value > 0);
  return Math.max(1, last + (diffs[0] ?? 15));
}

function sectionTiming(section: AnalysedSectionMarker, sections: SectionMarker[], beatsPerBar: number) {
  const songEndBeat = Math.max(...sections.map(item => item.startBeat + Math.max(1, item.lengthBeats)), 1);
  const duration = referenceDuration(section.analysis.reference, songEndBeat);
  const sectionEndBeat = section.startBeat + Math.max(1, section.lengthBeats);
  const highlightStart = Math.max(0, section.startBeat / songEndBeat * duration);
  const highlightEnd = Math.min(duration, sectionEndBeat / songEndBeat * duration);
  const startBar = Math.floor(section.startBeat / beatsPerBar) + 1;
  const endBar = Math.max(startBar, Math.ceil(sectionEndBeat / beatsPerBar));
  return {
    duration,
    highlightStart,
    highlightEnd,
    barLabel: `Bars ${startBar}-${endBar}`,
    timeLabel: `${formatTime(highlightStart)}-${formatTime(highlightEnd)}`,
  };
}

function pointsInWindow(points: InstrumentPoint[], start: number, end: number): InstrumentPoint[] {
  const inside = points.filter(point => point.timestamp >= start && point.timestamp < end);
  if (inside.length > 0 || points.length === 0) return inside;
  const middle = (start + end) / 2;
  return [points.reduce((best, point) =>
    Math.abs(point.timestamp - middle) < Math.abs(best.timestamp - middle) ? point : best,
  points[0])];
}

function moodsFromCurves(reference: ReferenceMoodAnalysis, start: number, end: number, timeLabel: string): MoodEvidence[] {
  return (reference.curves?.mood ?? [])
    .map(series => ({label: series.label, score: average(pointsInWindow(series.points, start, end))}))
    .filter(item => item.score > MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(item => ({label: formatEvidenceLabel(item.label), score: item.score, timeLabel}));
}

function moodsFromSegments(reference: ReferenceMoodAnalysis, start: number, end: number, timeLabel: string): MoodEvidence[] {
  const inside = reference.segments.filter(segment => segment.timestamp >= start && segment.timestamp < end);
  const sample = inside.length ? inside : reference.segments;
  const grouped = new Map<string, number[]>();
  sample.forEach(segment => {
    if (!segment.mood) return;
    grouped.set(segment.mood, [...(grouped.get(segment.mood) ?? []), segment.moodScore ?? 0.5]);
  });
  return Array.from(grouped.entries())
    .map(([label, scores]) => ({label, score: scores.reduce((sum, item) => sum + item, 0) / scores.length}))
    .filter(item => item.score > MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(item => ({label: formatEvidenceLabel(item.label), score: item.score, timeLabel}));
}

function fallbackMoods(mood: string, timeLabel: string): MoodEvidence[] {
  return mood.split(/,|\band\b/i)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map(label => ({label: formatEvidenceLabel(label), timeLabel}));
}

function graphModel(section: AnalysedSectionMarker, timing: ReturnType<typeof sectionTiming>): InstrumentGraphModel | null {
  const reference = section.analysis.reference;
  if (!reference) return null;
  const series = instrumentSeries(reference);
  if (series.length === 0) return null;
  return {
    sectionName: section.name,
    barLabel: timing.barLabel,
    timeLabel: timing.timeLabel,
    duration: timing.duration,
    highlightStart: timing.highlightStart,
    highlightEnd: timing.highlightEnd,
    series,
  };
}

export function buildLyricEvidenceModel(
  section: AnalysedSectionMarker,
  sections: SectionMarker[],
  beatsPerBar: number,
): LyricEvidenceModel {
  const timing = sectionTiming(section, sections, beatsPerBar);
  const reference = section.analysis.reference;
  const cyaniteMoods = reference
    ? moodsFromCurves(reference, timing.highlightStart, timing.highlightEnd, timing.timeLabel)
    : [];
  const segmentMoods = reference && cyaniteMoods.length === 0
    ? moodsFromSegments(reference, timing.highlightStart, timing.highlightEnd, timing.timeLabel)
    : [];
  const moods = cyaniteMoods.length ? cyaniteMoods : segmentMoods.length
    ? segmentMoods
    : fallbackMoods(section.analysis.mood, timing.timeLabel);
  const graph = graphModel(section, timing);
  return {
    sectionName: section.name,
    barLabel: timing.barLabel,
    timeLabel: timing.timeLabel,
    moods,
    graph,
  };
}
