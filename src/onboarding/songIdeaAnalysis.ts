import type {ProducerInsight, ScaleMetadata, SectionMarker} from '../store/projectMetadata';
import {cloneReferenceMoodAnalysis, type ReferenceMoodAnalysis} from '../store/referenceMoodAnalysis';
import type {SongSeedBpmKeyResponse, SongSeedLyricStructure, SongSeedTrack} from '../native/songSeedApi';
import {useDAWStore} from '../store/useDAWStore';
import {parseLyricSections, type LyricSectionSource} from './lyricSectioning';
import {createProducerInsight} from './producerInsight';

export type SongIdeaSectionAnalysis = {
  id: string;
  name: string;
  bars: number;
  lyricRange: {startLine: number; endLine: number};
  lyrics: string[];
  lyricPreview: string[];
  mood: string;
  meaning: string;
  productionDrivers: string[];
  productionCue: string;
  producerInsight?: ProducerInsight;
  confidence: number;
  sectionSource?: LyricSectionSource;
  sectionConfidence?: number;
  structureNote?: string;
};

export type SongIdeaAnalysis = {
  title: string;
  bpm: number;
  scale: ScaleMetadata;
  keySource: string;
  bpmKey: {source: string; confidence: number; note?: string};
  reference?: ReferenceMoodAnalysis;
  sections: SongIdeaSectionAnalysis[];
};

type SongIdeaSectionInput = Omit<SongIdeaSectionAnalysis, 'lyricPreview'> & {
  lyricPreview?: string[];
};

type SongIdeaAnalysisInput = Omit<SongIdeaAnalysis, 'sections'> & {
  sections: SongIdeaSectionInput[];
};

export type SongIdeaAnalysisSeed = {
  track: SongSeedTrack;
  lyrics?: string;
  lyricStructure?: SongSeedLyricStructure;
  structureNote?: string;
  bpmKey?: SongSeedBpmKeyResponse | null;
};

const SECTION_PLAN = [
  {name: 'Intro', bars: 4, hook: false},
  {name: 'Verse 1', bars: 8, hook: false},
  {name: 'Pre-Chorus 1', bars: 4, hook: false},
  {name: 'Chorus 1', bars: 8, hook: true},
  {name: 'Verse 2', bars: 8, hook: false},
  {name: 'Pre-Chorus 2', bars: 4, hook: false},
  {name: 'Chorus 2', bars: 8, hook: true},
  {name: 'Bridge', bars: 8, hook: false},
  {name: 'Final Chorus', bars: 8, hook: true},
  {name: 'Outro', bars: 4, hook: false},
];
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function cleanTitle(input: string): string {
  const trimmed = input.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : 'Untitled song idea';
}

function hashText(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function scaleFromKey(value: string | undefined, fallback: ScaleMetadata): ScaleMetadata {
  const root = value?.match(/[A-G](?:#|b)?/)?.[0];
  return root ? {root, mode: /min|minor|m\b/i.test(value ?? '') ? 'minor' : 'major'} : fallback;
}

function rangeFor(lines: string[], index: number) {
  const filled = Math.min(SECTION_PLAN.length, lines.length);
  if (lines.length === 0 || index >= filled) {
    return {startLine: 0, endLine: 0, lyrics: []};
  }
  const baseSize = Math.floor(lines.length / filled);
  const extraLines = lines.length % filled;
  const size = baseSize + (index < extraLines ? 1 : 0);
  const startLine = index * baseSize + Math.min(index, extraLines);
  const endLine = Math.min(lines.length - 1, startLine + size - 1);
  return {startLine, endLine, lyrics: lines.slice(startLine, endLine + 1)};
}

export function normalizeSongIdeaAnalysis(analysis: SongIdeaAnalysisInput): SongIdeaAnalysis {
  return {
    ...analysis,
    reference: analysis.reference ? cloneReferenceMoodAnalysis(analysis.reference) : undefined,
    sections: analysis.sections.map(section => ({
      ...section,
      lyrics: [...section.lyrics],
      lyricPreview: section.lyricPreview?.length ? [...section.lyricPreview] : [...section.lyrics],
      lyricRange: {...section.lyricRange},
      productionDrivers: [...section.productionDrivers],
      producerInsight: section.producerInsight ? {...section.producerInsight} : undefined,
    })),
  };
}

export function createSongIdeaAnalysis(seed: SongIdeaAnalysisSeed): SongIdeaAnalysis {
  const matched = seed.bpmKey?.ok === true ? seed.bpmKey : null;
  const title = cleanTitle(seed.track.title);
  const artist = seed.track.artist ?? matched?.artist;
  const hash = hashText(`${title} ${artist ?? ''}`.toLowerCase());
  const fallbackScale = {root: ROOTS[hash % ROOTS.length], mode: hash % 3 === 0 ? 'minor' : 'major'};
  const parsedLyrics = parseLyricSections(seed.lyrics, seed.lyricStructure);
  const lines = parsedLyrics.lines;
  const best = matched?.candidates?.[0] ?? null;
  const bpm = matched?.bpm ?? best?.bpm ?? 84 + (hash % 54);
  const scale = scaleFromKey(matched?.key ?? best?.key, fallbackScale);
  return normalizeSongIdeaAnalysis({
    title: artist ? `${title} - ${artist}` : title,
    bpm,
    scale,
    keySource: matched
      ? `${matched.source} (${Math.round(matched.confidence * 100)}% confidence)`
      : 'Local draft estimate',
    bpmKey: {
      source: matched?.source ?? 'local-estimate',
      confidence: matched?.confidence ?? 0.34,
      note: matched?.note,
    },
    sections: (parsedLyrics.sections.length ? parsedLyrics.sections : SECTION_PLAN.map((plan, index) => {
      const range = rangeFor(lines, index);
      return {
        ...plan,
        startLine: range.startLine,
        endLine: range.endLine,
        lyrics: range.lyrics,
        sectionSource: 'fallback-template' as const,
        sectionConfidence: matched ? matched.confidence : 0.52,
      };
    })).map((plan, index) => {
      const productionDrivers = plan.hook
        ? ['full drums', 'wide harmony', 'vocal doubles']
        : ['tight rhythm', 'filtered harmony', 'dry lead vocal'];
      return {
        id: `song-idea-${index}`,
        name: plan.name,
        bars: plan.bars,
        lyricRange: {startLine: plan.startLine, endLine: plan.endLine},
        lyrics: plan.lyrics,
        lyricPreview: plan.lyrics,
        mood: plan.hook ? 'open, memorable, and hook-forward' : 'focused, intimate, and building',
        meaning: plan.hook
          ? 'The central emotional idea resolves into a repeatable hook.'
          : 'The section sets up the narrator, tension, and imagery for the hook.',
        productionDrivers,
        productionCue: productionDrivers.join(', '),
        producerInsight: createProducerInsight({
          sectionName: plan.name,
          lyrics: plan.lyrics,
          hook: plan.hook,
          title,
          artist,
        }),
        confidence: plan.sectionConfidence,
        sectionSource: plan.sectionSource,
        sectionConfidence: plan.sectionConfidence,
        structureNote: seed.structureNote,
      };
    }),
  });
}

export function applyReferenceAnalysis(
  analysis: SongIdeaAnalysis,
  reference: ReferenceMoodAnalysis | null,
): SongIdeaAnalysis {
  return normalizeSongIdeaAnalysis({
    ...analysis,
    reference: reference ? cloneReferenceMoodAnalysis(reference) : analysis.reference,
  });
}

export function sectionsFromSongIdea(analysis: SongIdeaAnalysis): SectionMarker[] {
  let cursor = 0;
  return analysis.sections.map(section => {
    const lengthBeats = section.bars * 4;
    const marker: SectionMarker = {
      id: section.id,
      name: section.name,
      startBeat: cursor,
      lengthBeats,
      analysis: {
        mood: section.mood,
        meaning: section.meaning,
        productionCue: section.productionCue,
        productionDrivers: [...section.productionDrivers],
        producerInsight: section.producerInsight ? {...section.producerInsight} : undefined,
        key: `${analysis.scale.root} ${analysis.scale.mode}`,
        bpm: analysis.bpm,
        bpmSource: analysis.bpmKey.source,
        bpmConfidence: analysis.bpmKey.confidence,
        confidence: section.confidence,
        sectionSource: section.sectionSource,
        sectionConfidence: section.sectionConfidence,
        structureNote: section.structureNote,
        reference: analysis.reference ? cloneReferenceMoodAnalysis(analysis.reference) : undefined,
        lyricRange: {...section.lyricRange},
        lyrics: [...section.lyrics],
        lyricPreview: [...section.lyricPreview],
      },
    };
    cursor += lengthBeats;
    return marker;
  });
}

export function applySongIdeaAnalysis(analysis: SongIdeaAnalysis): void {
  const store = useDAWStore.getState();
  store.setBpm(analysis.bpm);
  store.setScale(analysis.scale);
  store.setSections(sectionsFromSongIdea(analysis));
  store.setPlayheadBeat(0, {pauseIfPlaying: true});
}
