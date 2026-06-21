import type {ChordMetadata, ChordProgressionMetadata, ScaleMetadata, SectionMarker} from '../../store/projectMetadata';
import type {LyricSection} from '../../store/lyrics';
import type {ReferenceMoodAnalysis} from '../../store/referenceMoodAnalysis';
import {
  analyzeLyricProducerSection,
  type LyricProducerContextSection,
  type LyricProducerLineInput,
  type LyricProducerSectionAnalysis,
} from './lyricProducerAnalysis';

export type SectionAnalysis = NonNullable<SectionMarker['analysis']>;
export type AnalysedSectionMarker = SectionMarker & {analysis: SectionAnalysis};
export type InstrumentPoint = {timestamp: number; value: number};
export type InstrumentSeries = {label: string; points: InstrumentPoint[]; average: number};
export type HarmonyContext = {scale?: ScaleMetadata | null; chord?: ChordMetadata | null};
export type LyricChordEvidence = {label: string; detail: string; kind: 'verified' | 'project' | 'suggested' | 'unavailable'};
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
  sourceLabel: string;
  moods: MoodEvidence[];
  producer: LyricProducerSectionAnalysis;
  chord: LyricChordEvidence;
  graph: InstrumentGraphModel | null;
};
export type TimelineLyricLayout = {
  id: string;
  name: string;
  startBeat: number;
  startPx: number;
  width: number;
  preview: string;
  ariaLabel: string;
  className?: string;
  evidence: LyricEvidenceModel;
};

const MIN_SCORE = 0.05;
const DEFAULT_SECTION_SECONDS_PER_BEAT = 3.75;
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export function hasAnalysis(section: SectionMarker): section is AnalysedSectionMarker {
  return Boolean(section.analysis);
}

export function firstLyric(section: AnalysedSectionMarker): string {
  return section.analysis.lyrics?.[0] ?? section.analysis.lyricPreview?.[0] ?? section.analysis.meaning ?? '';
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
  const curved = reference.curves?.instrumentsExtended?.length ? reference.curves.instrumentsExtended : reference.curves?.instruments;
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
  const curveTimes = Object.values(reference.curves ?? {}).flatMap(series => series.flatMap(item => item.points.map(point => point.timestamp)));
  const timestamps = [...curveTimes, ...reference.segments.map(segment => segment.timestamp)].filter(value => Number.isFinite(value)).sort((a, b) => a - b);
  const diffs = timestamps.slice(1).map((value, index) => value - timestamps[index]).filter(value => value > 0);
  return Math.max(1, (timestamps[timestamps.length - 1] ?? 0) + (diffs[0] ?? 15));
}

function sectionTiming(section: AnalysedSectionMarker, sections: SectionMarker[], beatsPerBar: number) {
  const songEndBeat = Math.max(...sections.map(item => item.startBeat + Math.max(1, item.lengthBeats)), 1);
  const duration = referenceDuration(section.analysis.reference, songEndBeat);
  const sectionEndBeat = section.startBeat + Math.max(1, section.lengthBeats);
  return timingFromBeats(section.startBeat, sectionEndBeat, beatsPerBar, duration, songEndBeat);
}

function timingFromBeats(startBeat: number, endBeat: number, beatsPerBar: number, duration = 0, songEndBeat = 0) {
  const highlightStart = songEndBeat > 0 ? Math.max(0, startBeat / songEndBeat * duration) : 0;
  const highlightEnd = songEndBeat > 0 ? Math.min(duration, endBeat / songEndBeat * duration) : 0;
  const startBar = Math.floor(startBeat / beatsPerBar) + 1;
  const endBar = Math.max(startBar, Math.ceil(endBeat / beatsPerBar));
  return {
    duration,
    highlightStart,
    highlightEnd,
    barLabel: `Bars ${startBar}-${endBar}`,
    timeLabel: duration > 0 ? `${formatTime(highlightStart)}-${formatTime(highlightEnd)}` : 'Authored lyrics',
  };
}

function pointsInWindow(points: InstrumentPoint[], start: number, end: number): InstrumentPoint[] {
  const inside = points.filter(point => point.timestamp >= start && point.timestamp < end);
  if (inside.length > 0 || points.length === 0) return inside;
  const middle = (start + end) / 2;
  return [points.reduce((best, point) => Math.abs(point.timestamp - middle) < Math.abs(best.timestamp - middle) ? point : best, points[0])];
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
    if (segment.mood) grouped.set(segment.mood, [...(grouped.get(segment.mood) ?? []), segment.moodScore ?? 0.5]);
  });
  return Array.from(grouped.entries())
    .map(([label, scores]) => ({label, score: scores.reduce((sum, item) => sum + item, 0) / scores.length}))
    .filter(item => item.score > MIN_SCORE)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3)
    .map(item => ({label: formatEvidenceLabel(item.label), score: item.score, timeLabel}));
}

function fallbackMoods(mood: string, timeLabel: string): MoodEvidence[] {
  return mood.split(/,|\band\b/i).map(item => item.trim()).filter(Boolean).slice(0, 3).map(label => ({label: formatEvidenceLabel(label), timeLabel}));
}

function graphModel(section: AnalysedSectionMarker, timing: ReturnType<typeof sectionTiming>): InstrumentGraphModel | null {
  const reference = section.analysis.reference;
  if (!reference) return null;
  const series = instrumentSeries(reference);
  if (series.length === 0) return null;
  return {...timing, sectionName: section.name, series};
}

function scaleFromText(value: string | undefined): ScaleMetadata | null {
  const root = value?.match(/[A-G](?:#|b)?/)?.[0];
  if (!root) return null;
  return {root, mode: /min|minor|m\b/i.test(value ?? '') ? 'minor' : 'major'};
}

function chordAt(root: string, offset: number, minor = false): string {
  const index = ROOTS.indexOf(root);
  const name = ROOTS[((index >= 0 ? index : 0) + offset) % ROOTS.length];
  return minor ? `${name}m` : name;
}

function suggestedChords(scale: ScaleMetadata, sectionName: string): string[] {
  if (scale.mode === 'minor') return [chordAt(scale.root, 0, true), chordAt(scale.root, 8), chordAt(scale.root, 3), chordAt(scale.root, 10)];
  return /verse/i.test(sectionName)
    ? [chordAt(scale.root, 0), chordAt(scale.root, 9, true), chordAt(scale.root, 5), chordAt(scale.root, 7)]
    : [chordAt(scale.root, 0), chordAt(scale.root, 7), chordAt(scale.root, 9, true), chordAt(scale.root, 5)];
}

function chordEvidence(
  sectionName: string,
  progression: ChordProgressionMetadata | undefined,
  analysisKey: string | undefined,
  harmony?: HarmonyContext,
): LyricChordEvidence {
  if (progression?.chords.length) {
    return {label: 'Verified progression', detail: progression.chords.join(' - '), kind: 'verified'};
  }
  if (harmony?.chord?.symbol) {
    return {label: 'Project chord', detail: harmony.chord.symbol, kind: 'project'};
  }
  const scale = harmony?.scale ?? scaleFromText(analysisKey);
  if (scale?.root) {
    return {label: 'Suggested progression', detail: suggestedChords(scale, sectionName).join(' - '), kind: 'suggested'};
  }
  return {label: 'Chord progression', detail: 'Unavailable until a key or verified chord source is set.', kind: 'unavailable'};
}

function analysisLines(section: AnalysedSectionMarker): LyricProducerLineInput[] {
  const lines = section.analysis.lyrics?.length ? section.analysis.lyrics : section.analysis.lyricPreview;
  return (lines ?? []).map((text, index) => ({id: `${section.id}-${index}`, text}));
}

function analysisContext(section: AnalysedSectionMarker, sections: SectionMarker[]): LyricProducerContextSection[] {
  const index = sections.findIndex(item => item.id === section.id);
  return [sections[index - 1], sections[index + 1]]
    .filter((item): item is AnalysedSectionMarker => Boolean(item && hasAnalysis(item)))
    .map(item => ({sectionName: item.name, lines: analysisLines(item)}));
}

function sourceLabelFor(section: AnalysedSectionMarker): string {
  const source = section.analysis.sectionSource;
  const labels = {
    'musixmatch-structure': 'verified from Musixmatch structure',
    'lyric-headers': 'verified from lyric headers',
    repetition: 'detected from repetition',
    model: 'model inferred',
    'fallback-template': 'fallback template',
  } as const;
  const label = source ? labels[source] : '';
  const confidence = typeof section.analysis.sectionConfidence === 'number'
    ? ` (${Math.round(section.analysis.sectionConfidence * 100)}%)`
    : '';
  const note = section.analysis.structureNote ? `; ${section.analysis.structureNote}` : '';
  return label ? `Song seed - ${label}${confidence}${note}` : `Song seed${note}`;
}

export function buildLyricEvidenceModel(
  section: AnalysedSectionMarker,
  sections: SectionMarker[],
  beatsPerBar: number,
  harmony?: HarmonyContext,
): LyricEvidenceModel {
  const timing = sectionTiming(section, sections, beatsPerBar);
  const reference = section.analysis.reference;
  const cyaniteMoods = reference ? moodsFromCurves(reference, timing.highlightStart, timing.highlightEnd, timing.timeLabel) : [];
  const segmentMoods = reference && cyaniteMoods.length === 0 ? moodsFromSegments(reference, timing.highlightStart, timing.highlightEnd, timing.timeLabel) : [];
  const moods = cyaniteMoods.length ? cyaniteMoods : segmentMoods.length ? segmentMoods : fallbackMoods(section.analysis.mood, timing.timeLabel);
  return {
    sectionName: section.name,
    barLabel: timing.barLabel,
    timeLabel: timing.timeLabel,
    sourceLabel: sourceLabelFor(section),
    moods,
    producer: analyzeLyricProducerSection({
      sectionName: section.name,
      lines: analysisLines(section),
      context: analysisContext(section, sections),
    }),
    chord: chordEvidence(section.name, section.analysis.chordProgression, section.analysis.key, harmony),
    graph: graphModel(section, timing),
  };
}

export function buildAuthoredLyricEvidenceModel(
  section: LyricSection,
  endBeat: number,
  beatsPerBar: number,
  harmony?: HarmonyContext,
  context?: LyricProducerContextSection[],
): LyricEvidenceModel {
  const startBeat = section.startBeat ?? 0;
  const timing = timingFromBeats(startBeat, Math.max(startBeat + 1, endBeat), beatsPerBar);
  return {
    sectionName: section.name,
    barLabel: timing.barLabel,
    timeLabel: timing.timeLabel,
    sourceLabel: 'Authored',
    moods: [],
    producer: analyzeLyricProducerSection({sectionName: section.name, lines: section.lines, context}),
    chord: chordEvidence(section.name, undefined, undefined, harmony),
    graph: null,
  };
}
