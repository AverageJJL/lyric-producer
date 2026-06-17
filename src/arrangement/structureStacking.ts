import type {SampleProviderEntry} from '../native/mediaImportApi';
import type {SectionMarker} from '../store/projectMetadata';

export type StructureTemplateId = 'beat_sketch' | 'full_song';

export type StructureTemplate = {
  id: StructureTemplateId;
  label: string;
  parts: Array<{name: string; bars: number}>;
};

export type SampleStackPick = {
  roleId: string;
  roleLabel: string;
  sample: SampleProviderEntry;
};

export const STRUCTURE_TEMPLATES: StructureTemplate[] = [
  {
    id: 'beat_sketch',
    label: 'Beat sketch',
    parts: [
      {name: 'Intro', bars: 4},
      {name: 'Verse', bars: 8},
      {name: 'Hook', bars: 8},
      {name: 'Outro', bars: 4},
    ],
  },
  {
    id: 'full_song',
    label: 'Full song',
    parts: [
      {name: 'Intro', bars: 4},
      {name: 'Verse', bars: 8},
      {name: 'Chorus', bars: 8},
      {name: 'Verse 2', bars: 8},
      {name: 'Chorus 2', bars: 8},
      {name: 'Outro', bars: 4},
    ],
  },
];

const STACK_ROLES = [
  {id: 'drums', label: 'Drums', terms: ['drum', 'kick', 'snare', 'hat', 'beat', 'loop']},
  {id: 'bass', label: 'Bass', terms: ['bass', '808', 'sub']},
  {id: 'melody', label: 'Melody', terms: ['melody', 'keys', 'piano', 'lead', 'synth']},
  {id: 'texture', label: 'Texture', terms: ['pad', 'fx', 'texture', 'ambient', 'vocal']},
];

function cleanId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function words(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function templateForId(templateId: StructureTemplateId): StructureTemplate {
  return STRUCTURE_TEMPLATES.find(template => template.id === templateId)
    ?? STRUCTURE_TEMPLATES[0];
}

export function buildStructureSections(input: {
  templateId: StructureTemplateId;
  startBeat?: number;
  beatsPerBar?: number;
}): SectionMarker[] {
  const template = templateForId(input.templateId);
  const beatsPerBar = Math.max(1, Math.round(input.beatsPerBar ?? 4));
  let cursor = Math.max(0, input.startBeat ?? 0);

  return template.parts.map((part, index) => {
    const lengthBeats = Math.max(1, part.bars * beatsPerBar);
    const section = {
      id: `structure-${cleanId(part.name)}-${index}`,
      name: part.name,
      startBeat: cursor,
      lengthBeats,
    };
    cursor += lengthBeats;
    return section;
  });
}

function sampleSearchText(sample: SampleProviderEntry): string {
  return [sample.name, sample.providerLabel, ...sample.tags].join(' ').toLowerCase();
}

function scoreSample(
  sample: SampleProviderEntry,
  roleTerms: string[],
  queryTerms: string[],
): number {
  const text = sampleSearchText(sample);
  const roleScore = roleTerms.reduce(
    (score, term) => score + (text.includes(term) ? 4 : 0),
    0,
  );
  const queryScore = queryTerms.reduce(
    (score, term) => score + (text.includes(term) ? 2 : 0),
    0,
  );
  return roleScore + queryScore;
}

export function curateSampleStack(input: {
  samples: SampleProviderEntry[];
  query?: string;
  count?: number;
}): SampleStackPick[] {
  const queryTerms = words(input.query ?? '');
  const usedSampleIds = new Set<string>();
  const maxCount = Math.max(1, Math.min(input.count ?? 4, STACK_ROLES.length));

  return STACK_ROLES.slice(0, maxCount).flatMap(role => {
    const ranked = input.samples
      .filter(sample => !usedSampleIds.has(sample.id))
      .map(sample => ({
        sample,
        score: scoreSample(sample, role.terms, queryTerms),
      }))
      .sort((left, right) => right.score - left.score || left.sample.name.localeCompare(right.sample.name));
    const pick = ranked[0]?.sample;
    if (!pick) {
      return [];
    }
    usedSampleIds.add(pick.id);
    return [{roleId: role.id, roleLabel: role.label, sample: pick}];
  });
}
