import {knownPublicSongContext} from './songSeedMetadata';
import {buildProducerInsight} from './songSeedProducerInsight';
import type {SongSeedAnalyzeRequest, SongSeedAnalyzedSection} from './songSeedAnalysis';
import {normalizeSongText} from './songSeedUtils';

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

function sectionRange(lines: string[], index: number) {
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

function sectionToken(name: string): string {
  return normalizeSongText(name).replace(/\b\d+\b/g, '').replace(/\s+/g, ' ').trim();
}

export function buildFallbackSongSections(
  request: SongSeedAnalyzeRequest,
  lines: string[],
): SongSeedAnalyzedSection[] {
  const publicContext = request.track ? knownPublicSongContext({
    title: request.track.title,
    artist: request.track.artist,
  }) : null;
  return SECTION_PLAN.map((plan, index) => {
    const range = sectionRange(lines, index);
    const productionDrivers = publicContext
      ? ['programmed drums', 'synths', 'percussion guitar', 'layered vocals']
      : plan.hook ? ['full drums', 'wide chords', 'vocal doubles'] : ['tight rhythm', 'filtered harmony', 'dry lead vocal'];
    return {
      id: `song-idea-${index}`,
      name: plan.name,
      bars: plan.bars,
      lyricRange: {startLine: range.startLine, endLine: range.endLine},
      lyrics: range.lyrics,
      mood: plan.hook ? 'bright, controlled, and hook-forward' : 'focused, intimate, and building',
      meaning: plan.hook
        ? 'The emotional thesis lands in a repeated phrase that can anchor the arrangement.'
        : 'The section sets up the narrator, tension, and images that make the hook feel earned.',
      productionDrivers,
      productionCue: productionDrivers.join(', '),
      producerInsight: buildProducerInsight({
        sectionName: plan.name,
        lyrics: range.lyrics,
        hook: plan.hook,
        publicContext: publicContext?.productionContext,
      }),
      confidence: publicContext ? 0.78 : 0.52,
    };
  });
}

export function hasCompleteSongArc(sections: SongSeedAnalyzedSection[]): boolean {
  const names = sections.map(section => sectionToken(section.name));
  return sections.length >= 8
    && names.filter(name => name.includes('verse')).length >= 2
    && names.filter(name => name.includes('chorus')).length >= 2;
}

export function mergeIntoFullSongSections(
  base: SongSeedAnalyzedSection[],
  modelSections: SongSeedAnalyzedSection[],
): SongSeedAnalyzedSection[] {
  const used = new Set<number>();
  return base.map((section, index) => {
    const token = sectionToken(section.name);
    const matchIndex = modelSections.findIndex((candidate, candidateIndex) => (
      !used.has(candidateIndex) && sectionToken(candidate.name) === token
    ));
    const fallbackIndex = matchIndex >= 0 ? matchIndex : index < modelSections.length ? index : -1;
    const model = fallbackIndex >= 0 ? modelSections[fallbackIndex] : null;
    if (!model) {
      return section;
    }
    used.add(fallbackIndex);
    return {
      ...section,
      mood: model.mood,
      meaning: model.meaning,
      productionDrivers: [...model.productionDrivers],
      productionCue: model.productionCue,
      producerInsight: model.producerInsight ? {...model.producerInsight} : section.producerInsight,
      confidence: model.confidence,
    };
  });
}
