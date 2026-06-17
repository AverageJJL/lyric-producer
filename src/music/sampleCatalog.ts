import type {DrumSampleKey} from '../assets/drumKit';
import {
  buildDrumKitSampleMap,
  DRUM_LANE_LABELS,
  DRUM_SAMPLE_KEYS,
  drumSampleRelativePath,
  POP_DRUM_KIT_ID,
} from '../assets/drumKit';

/** Mood/genre tags for future LLM sample selection. */
export type SampleTag =
  | 'drums'
  | 'kick'
  | 'snare'
  | 'hihat'
  | 'pop'
  | 'electronic'
  | 'lofi'
  | 'bright'
  | 'dark'
  | 'warm'
  | 'percussion';

export type SampleCatalogEntry = {
  id: string;
  label: string;
  relativePath: string;
  tags: SampleTag[];
  /** MIDI note used for keyboard trigger preview on drum lanes. */
  triggerNote?: number;
};

export type SampleKitDefinition = {
  id: string;
  label: string;
  tags: SampleTag[];
  samples: SampleCatalogEntry[];
};

const DRUM_TRIGGER_NOTES: Record<DrumSampleKey, number> = {
  kick: 36,
  snare: 38,
  hatClosed: 42,
  hatOpen: 46,
  tom1: 45,
  tom2: 47,
  perc: 37,
  clap: 39,
};

export function triggerNoteForDrumSample(key: DrumSampleKey): number {
  return DRUM_TRIGGER_NOTES[key];
}

export function drumSampleForTriggerNote(note: number): DrumSampleKey | null {
  return (DRUM_SAMPLE_KEYS.find(key => DRUM_TRIGGER_NOTES[key] === note) ?? null);
}

function tagsForDrumKey(key: DrumSampleKey): SampleTag[] {
  if (key === 'kick') {
    return ['drums', 'kick', 'pop'];
  }
  if (key === 'snare') {
    return ['drums', 'snare', 'pop'];
  }
  if (key.startsWith('hat')) {
    return ['drums', 'hihat', 'pop'];
  }
  if (key === 'perc' || key === 'clap') {
    return ['drums', 'percussion', 'pop'];
  }
  return ['drums', 'percussion', 'pop'];
}

function drumEntries(): SampleCatalogEntry[] {
  return DRUM_SAMPLE_KEYS.map(key => ({
    id: key,
    label: DRUM_LANE_LABELS[key],
    relativePath: drumSampleRelativePath(key),
    tags: tagsForDrumKey(key),
    triggerNote: DRUM_TRIGGER_NOTES[key],
  }));
}

export const POP_BASIC_DRUM_KIT: SampleKitDefinition = {
  id: POP_DRUM_KIT_ID,
  label: 'Pop Basic',
  tags: ['drums', 'pop', 'electronic'],
  samples: drumEntries(),
};

export const SAMPLE_KITS: SampleKitDefinition[] = [POP_BASIC_DRUM_KIT];

export function sampleKitById(kitId: string): SampleKitDefinition | undefined {
  return SAMPLE_KITS.find(kit => kit.id === kitId);
}

export function buildSamplePathMap(kitId: string): Record<string, string> {
  const kit = sampleKitById(kitId);
  if (!kit) {
    return buildDrumKitSampleMap();
  }

  const map: Record<string, string> = {};
  kit.samples.forEach(sample => {
    map[sample.id] = sample.relativePath;
  });
  return map;
}

export function samplesMatchingTags(tags: SampleTag[]): SampleCatalogEntry[] {
  const normalized = new Set(tags);
  const matches: SampleCatalogEntry[] = [];
  SAMPLE_KITS.forEach(kit => {
    kit.samples.forEach(sample => {
      if (sample.tags.some(tag => normalized.has(tag))) {
        matches.push(sample);
      }
    });
  });
  return matches;
}

export function sampleKeyForTriggerNote(
  kitId: string,
  note: number,
): string | null {
  const kit = sampleKitById(kitId);
  if (!kit) {
    return null;
  }
  const hit = kit.samples.find(sample => sample.triggerNote === note);
  return hit?.id ?? null;
}
