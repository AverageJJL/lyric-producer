import {normalizeSongIdeaAnalysis, type SongIdeaAnalysis} from '../../onboarding/songIdeaAnalysis';
import type {SongSeedLyricStructure, SongSeedTrack} from '../../native/songSeedApi';
import type {ReferenceMoodAnalysis} from '../../store/referenceMoodAnalysis';

export type SearchState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';
export type LyricsState = 'idle' | 'loading' | 'ready' | 'error';
export type MetadataDraft = {bpm: number; root: string; mode: string};
export type MetadataFieldState = {bpm?: boolean; key?: boolean};

const ROOT_ALIASES: Record<string, string> = {
  C: 'C', 'C#': 'C#', CS: 'C#', C_SHARP: 'C#', DB: 'C#', D_FLAT: 'C#',
  D: 'D', 'D#': 'Eb', DS: 'Eb', D_SHARP: 'Eb', EB: 'Eb', E_FLAT: 'Eb',
  E: 'E', FB: 'E', F_FLAT: 'E', 'E#': 'F', E_SHARP: 'F',
  F: 'F', 'F#': 'F#', FS: 'F#', F_SHARP: 'F#', GB: 'F#', G_FLAT: 'F#',
  G: 'G', 'G#': 'Ab', GS: 'Ab', G_SHARP: 'Ab', AB: 'Ab', A_FLAT: 'Ab',
  A: 'A', 'A#': 'Bb', A_SHARP: 'Bb', BB: 'Bb', B_FLAT: 'Bb',
  B: 'B', CB: 'B', C_FLAT: 'B',
};

export function trackLabel(track: SongSeedTrack): string {
  return [track.title, track.artist].filter(Boolean).join(' - ');
}

export function draftFromAnalysis(analysis: SongIdeaAnalysis): MetadataDraft {
  return {bpm: analysis.bpm, root: analysis.scale.root, mode: analysis.scale.mode};
}

export function applyDraft(analysis: SongIdeaAnalysis, draft: MetadataDraft): SongIdeaAnalysis {
  return normalizeSongIdeaAnalysis({
    ...analysis,
    bpm: Math.max(40, Math.min(240, Math.round(draft.bpm))),
    scale: {root: draft.root, mode: draft.mode},
  });
}

export function trackKey(track: SongSeedTrack): string {
  return [
    track.id, track.isrc, track.commontrackId, track.title, track.artist,
    track.album, track.releaseYear, track.hasTrackStructure ? 'structured' : 'unstructured',
  ].filter(Boolean).join('|');
}

function structureSignature(structure: SongSeedLyricStructure | undefined): string {
  if (!structure) return 'no-structure';
  return Object.keys(structure).sort()
    .map(role => `${role}:${[...(structure[role as keyof SongSeedLyricStructure] ?? [])].sort((a, b) => a - b).join(',')}`)
    .join(';') || 'empty-structure';
}

export function analysisKey(
  track: SongSeedTrack,
  lyrics: string,
  structure?: SongSeedLyricStructure,
  structureStatus = '',
): string {
  return `${trackKey(track)}|${lyrics.length}|${lyrics.slice(0, 180)}|${structureSignature(structure)}|${structureStatus}`;
}

export function mergeMetadata(base: SongIdeaAnalysis, metadata: SongIdeaAnalysis, locks: MetadataFieldState = {}): SongIdeaAnalysis {
  return normalizeSongIdeaAnalysis({
    ...base,
    bpm: locks.bpm ? base.bpm : metadata.bpm,
    scale: locks.key ? base.scale : metadata.scale,
    keySource: locks.bpm || locks.key ? base.keySource : metadata.keySource,
    bpmKey: locks.bpm || locks.key ? base.bpmKey : metadata.bpmKey,
  });
}

export function hasReferenceMetadata(reference: ReferenceMoodAnalysis | null, dirty: MetadataFieldState = {}): boolean {
  return Boolean((reference?.bpm && !dirty.bpm) || (reference?.key && !dirty.key));
}

function scaleFromReference(reference: ReferenceMoodAnalysis, fallback: SongIdeaAnalysis['scale']) {
  const normalized = (reference.key ?? '').trim()
    .replace(/[♭]/g, 'b')
    .replace(/[♯]/g, '#')
    .replace(/^([a-g](?:s|b)?)(major|minor)$/i, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toUpperCase();
  const mode = /MINOR|_MIN\b|MIN\b/.test(normalized) ? 'minor' : /MAJOR|_MAJ\b|MAJ\b/.test(normalized) ? 'major' : fallback.mode;
  const rootKey = normalized.replace(/_(MAJOR|MINOR|MAJ|MIN).*$/, '');
  const root = ROOT_ALIASES[rootKey] ?? reference.key?.match(/[A-G](?:#|b)?/)?.[0];
  return root ? {root, mode} : fallback;
}

export function mergeReferenceMetadata(base: SongIdeaAnalysis, reference: ReferenceMoodAnalysis, dirty: MetadataFieldState = {}): SongIdeaAnalysis {
  if (!hasReferenceMetadata(reference, dirty)) return base;
  const source = reference.source ? `${reference.source.channelTitle}, ${Math.round(reference.source.confidence * 100)}% match` : 'Cyanite reference';
  return normalizeSongIdeaAnalysis({
    ...base,
    bpm: reference.bpm && !dirty.bpm ? Math.max(40, Math.min(240, Math.round(reference.bpm))) : base.bpm,
    scale: reference.key && !dirty.key ? scaleFromReference(reference, base.scale) : base.scale,
    keySource: `Cyanite reference (${source})`,
    bpmKey: {source: 'cyanite', confidence: 0.96, note: 'BPM/key from Cyanite reference analysis'},
  });
}

export function mergeSectionEnrichment(base: SongIdeaAnalysis, enriched: SongIdeaAnalysis): SongIdeaAnalysis {
  const protectsLyricRanges = base.sections.some(section => (
    section.sectionSource === 'musixmatch-structure'
    || section.sectionSource === 'lyric-headers'
    || section.sectionSource === 'repetition'
  ));
  if (!protectsLyricRanges && enriched.sections.length >= base.sections.length) {
    return normalizeSongIdeaAnalysis({...base, sections: enriched.sections});
  }
  return normalizeSongIdeaAnalysis({
    ...base,
    sections: base.sections.map((section, index) => {
      const update = enriched.sections[index];
      return update ? {
        ...section,
        mood: update.mood,
        meaning: update.meaning,
        productionDrivers: [...update.productionDrivers],
        productionCue: update.productionCue,
        producerInsight: update.producerInsight ? {...update.producerInsight} : section.producerInsight,
        confidence: update.confidence,
      } : section;
    }),
  });
}
