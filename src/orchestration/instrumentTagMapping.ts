import {
  DRUM_MACHINE_INSTRUMENT,
  INSTRUMENTS,
  SYNTH_LEAD,
  VOICE_AUDIO_INSTRUMENT,
  type InstrumentDefinition,
} from '../music/instruments';
import {
  POP_BASIC_DRUM_KIT,
  SAMPLE_KITS,
  type SampleCatalogEntry,
} from '../music/sampleCatalog';
import type {TrackTemplateId} from '../music/trackTemplates';

export type InstrumentResolutionTier = 'explicit' | 'contextual' | 'fallback';

export type InstrumentResolutionContext = {
  text?: string;
  mood?: string[];
  genre?: string[];
  energy?: 'low' | 'medium' | 'high';
};

export type InstrumentTagResolution = {
  tier: InstrumentResolutionTier;
  templateId: TrackTemplateId;
  instrumentId: string;
  presetId: string;
  label: string;
  sampleKitId?: string;
  sampleId?: string;
  reason: string;
};

export type InstrumentTagResolutionInput = {
  instrumentTag?: string | null;
  presetName?: string | null;
  context?: InstrumentResolutionContext;
};

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function words(value: string): string[] {
  return value.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function candidateKeys(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  const parts = words(value);
  const keys = [normalize(value)];
  [3, 2, 1].forEach(size => {
    parts.forEach((_, index) => {
      const group = parts.slice(index, index + size);
      if (group.length === size) {
        keys.push(group.join('_'));
      }
    });
  });
  return Array.from(new Set(keys.filter(Boolean)));
}

function inputKeys(input: InstrumentTagResolutionInput): Set<string> {
  const raw = [
    input.instrumentTag,
    input.presetName,
    input.context?.text,
    ...(input.context?.mood ?? []),
    ...(input.context?.genre ?? []),
    input.context?.energy,
  ].filter(Boolean);
  return new Set(raw.flatMap(value => candidateKeys(value)));
}

function templateForInstrument(instrument: InstrumentDefinition): TrackTemplateId {
  if (instrument.id === VOICE_AUDIO_INSTRUMENT.id) {
    return 'voice_audio';
  }
  if (instrument.id === DRUM_MACHINE_INSTRUMENT.id) {
    return 'drum_machine';
  }
  return 'virtual_instrument';
}

function resolution(
  tier: InstrumentResolutionTier,
  instrument: InstrumentDefinition,
  reason: string,
  presetId?: string,
  sample?: SampleCatalogEntry,
): InstrumentTagResolution {
  return {
    tier,
    templateId: templateForInstrument(instrument),
    instrumentId: instrument.id,
    presetId: presetId ?? instrument.defaultPresetId,
    label: instrument.label,
    sampleKitId: instrument.sampleKitId,
    sampleId: sample?.id,
    reason,
  };
}

type InstrumentMatch = {instrument: InstrumentDefinition; presetId?: string};

const EXPLICIT_ALIASES: Record<string, {instrumentId: string; presetId?: string}> = {
  // AI prose can be loose, but execution must land on stable catalog IDs.
  '808': {instrumentId: 'synth_bass', presetId: '808_sub'},
  analog_moog: {instrumentId: 'synth_bass'},
  audio: {instrumentId: 'voice_audio'},
  bass: {instrumentId: 'bass_growly'},
  bass_synth: {instrumentId: 'synth_bass'},
  bell: {instrumentId: 'bell_mallets'},
  bells: {instrumentId: 'bell_mallets'},
  beat: {instrumentId: 'drum_machine_pop'},
  brass: {instrumentId: 'brass_stack'},
  drum: {instrumentId: 'drum_machine_pop'},
  drum_machine: {instrumentId: 'drum_machine_pop'},
  drums: {instrumentId: 'drum_machine_pop'},
  electric_bass: {instrumentId: 'bass_growly'},
  electric_keys: {instrumentId: 'keys_electric'},
  electric_guitar: {instrumentId: 'guitar_emily'},
  flute: {instrumentId: 'winds_flute'},
  guitar: {instrumentId: 'guitar_emily'},
  keys: {instrumentId: 'keys_piano'},
  mallet: {instrumentId: 'bell_mallets'},
  mallets: {instrumentId: 'bell_mallets'},
  moog: {instrumentId: 'synth_bass'},
  organ: {instrumentId: 'keys_organ'},
  pad: {instrumentId: 'synth_pad'},
  percussion: {instrumentId: 'drum_machine_pop'},
  piano: {instrumentId: 'keys_piano'},
  pluck: {instrumentId: 'synth_lead', presetId: 'pluck_bright'},
  rhodes: {instrumentId: 'keys_electric'},
  string: {instrumentId: 'strings_ensemble'},
  strings: {instrumentId: 'strings_ensemble'},
  sub_bass: {instrumentId: 'synth_bass'},
  synth_bass: {instrumentId: 'synth_bass'},
  synth_lead: {instrumentId: 'synth_lead'},
  synth_pad: {instrumentId: 'synth_pad'},
  vocal: {instrumentId: 'voice_audio'},
  vocals: {instrumentId: 'voice_audio'},
  voice: {instrumentId: 'voice_audio'},
  warm_analog_moog: {instrumentId: 'synth_bass'},
};

function findInstrumentMatch(key: string): InstrumentMatch | null {
  const alias = EXPLICIT_ALIASES[key];
  if (alias) {
    const instrument = INSTRUMENTS.find(item => item.id === alias.instrumentId);
    return instrument ? {instrument, presetId: alias.presetId} : null;
  }

  for (const instrument of INSTRUMENTS) {
    const directNames = [
      instrument.id,
      instrument.label,
      instrument.category,
      instrument.defaultPresetId,
    ].map(normalize);
    if (directNames.includes(key)) {
      return {instrument};
    }

    const preset = instrument.presets.find(item =>
      [item.id, item.label].map(normalize).includes(key),
    );
    if (preset) {
      return {instrument, presetId: preset.id};
    }
  }
  return null;
}

function explicitInstrument(value: string | null | undefined): InstrumentMatch | null {
  for (const key of candidateKeys(value)) {
    const match = findInstrumentMatch(key);
    if (match) {
      return match;
    }
  }
  return null;
}

function explicitSample(value: string | null | undefined): SampleCatalogEntry | null {
  const keys = candidateKeys(value);
  for (const kit of SAMPLE_KITS) {
    const sample = kit.samples.find(item => {
      const names = [item.id, item.label, ...item.tags].map(normalize);
      return keys.some(key => names.includes(key));
    });
    if (sample) {
      return sample;
    }
  }
  return null;
}

function explicitResolution(input: InstrumentTagResolutionInput): InstrumentTagResolution | null {
  const tagMatch = explicitInstrument(input.instrumentTag);
  const presetMatch = explicitInstrument(input.presetName);
  const sample = explicitSample(input.instrumentTag) ?? explicitSample(input.presetName);

  if (tagMatch) {
    const matchedPreset =
      presetMatch?.instrument.id === tagMatch.instrument.id
        ? presetMatch.presetId
        : tagMatch.presetId;
    return resolution(
      'explicit',
      tagMatch.instrument,
      `Matched explicit tag "${input.instrumentTag}".`,
      matchedPreset,
      tagMatch.instrument.id === DRUM_MACHINE_INSTRUMENT.id ? sample ?? undefined : undefined,
    );
  }

  if (sample) {
    return resolution(
      'explicit',
      DRUM_MACHINE_INSTRUMENT,
      `Matched drum sample "${sample.id}".`,
      undefined,
      sample,
    );
  }

  if (presetMatch) {
    return resolution(
      'explicit',
      presetMatch.instrument,
      `Matched explicit preset "${input.presetName}".`,
      presetMatch.presetId,
    );
  }
  return null;
}

function scoreInstrument(
  instrument: InstrumentDefinition,
  keySet: Set<string>,
  context?: InstrumentResolutionContext,
): number {
  const names = [
    normalize(instrument.id),
    normalize(instrument.label),
    normalize(instrument.category),
    normalize(instrument.subcategory),
    ...instrument.presets.flatMap(preset => [
      normalize(preset.id),
      normalize(preset.label),
      normalize(preset.category),
      normalize(preset.subcategory),
    ]),
  ];
  const tagMatches = [
    ...(instrument.tags?.mood ?? []),
    ...(instrument.tags?.genre ?? []),
    instrument.tags?.energy,
  ].filter(Boolean).map(item => normalize(item!));
  let score = names.reduce((sum, item) => sum + (keySet.has(item) ? 6 : 0), 0);
  score += tagMatches.reduce((sum, item) => sum + (keySet.has(item) ? 3 : 0), 0);
  if (context?.energy && instrument.tags?.energy === context.energy) {
    score += 2;
  }
  return score;
}

function canInferVoiceAudio(instrument: InstrumentDefinition, keySet: Set<string>): boolean {
  if (instrument.id !== VOICE_AUDIO_INSTRUMENT.id) {
    return true;
  }
  return ['audio', 'record', 'recording', 'vocal', 'vocals', 'voice'].some(key =>
    keySet.has(key),
  );
}

function contextualResolution(input: InstrumentTagResolutionInput): InstrumentTagResolution | null {
  const keySet = inputKeys(input);
  let best: {instrument: InstrumentDefinition; score: number} | null = null;
  INSTRUMENTS.forEach(instrument => {
    if (!canInferVoiceAudio(instrument, keySet)) {
      return;
    }
    const score = scoreInstrument(instrument, keySet, input.context);
    if (score > 0 && (!best || score > best.score)) {
      best = {instrument, score};
    }
  });
  return best
    ? resolution('contextual', best.instrument, `Inferred from context with score ${best.score}.`)
    : null;
}

export function resolveInstrumentTag(
  input: InstrumentTagResolutionInput,
): InstrumentTagResolution {
  return explicitResolution(input)
    ?? contextualResolution(input)
    ?? resolution(
      'fallback',
      SYNTH_LEAD,
      'No supported tag or context matched; using default lead.',
    );
}

export function sampleSuggestionsForInstrumentTag(input: InstrumentTagResolutionInput): SampleCatalogEntry[] {
  const tokenSet = inputKeys(input);
  return POP_BASIC_DRUM_KIT.samples.filter(sample =>
    sample.tags.some(tag => tokenSet.has(normalize(tag))) || tokenSet.has(normalize(sample.id)),
  );
}
