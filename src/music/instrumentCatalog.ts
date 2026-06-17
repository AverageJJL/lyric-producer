import {POP_BASIC_DRUM_KIT} from './sampleCatalog';
import {SAMPLER_SLICES_INSTRUMENT_ID, SAMPLER_SLICES_PRESET_ID} from './sampleInstruments';
import type {
  InstrumentCategory,
  InstrumentDefinition,
  InstrumentPreset,
  InstrumentSubcategory,
  InstrumentTags,
  InstrumentTaxonomyCategory,
  InstrumentTaxonomySubcategory,
} from './instrumentTypes';

// The taxonomy is broader than the sample library by design: AI/UI get stable
// musical intent IDs while every preset still maps to a shipped native engine.
const CATEGORY_ORDER: InstrumentCategory[] = [
  'Keys', 'Bass', 'Guitar', 'Lead', 'Pad', 'Strings', 'Winds', 'Brass', 'Mallets',
];

const SUBCATEGORY_ORDER: InstrumentSubcategory[] = [
  'Piano', 'Electric Piano', 'Organ', 'Electric Bass', 'Synth Bass', '808',
  'Electric Guitar', 'Synth Lead', 'Pluck', 'Synth Pad', 'String Ensemble',
  'Woodwinds', 'Brass Stack', 'Bells',
];

function preset(id: string, label: string, category: InstrumentCategory, subcategory: InstrumentSubcategory): InstrumentPreset {
  return {id, label, category, subcategory};
}

function fourOsc(
  id: string,
  label: string,
  category: InstrumentCategory,
  subcategory: InstrumentSubcategory,
  defaultPresetId: string,
  presets: InstrumentPreset[],
  tags: InstrumentTags,
): InstrumentDefinition {
  return {
    id,
    label,
    category,
    subcategory,
    nativeInstrument: 'four_osc',
    defaultPresetId,
    presets,
    tags,
  };
}

function sampleInstrument(
  id: string,
  label: string,
  category: InstrumentCategory,
  subcategory: InstrumentSubcategory,
  sampleInstrumentId: string,
  tags: InstrumentTags,
): InstrumentDefinition {
  return {
    id,
    label,
    category,
    subcategory,
    nativeInstrument: 'sample_instrument',
    defaultPresetId: sampleInstrumentId,
    presets: [preset(sampleInstrumentId, label, category, subcategory)],
    sampleInstrumentId,
    tags,
  };
}

export const KEYS_PIANO = sampleInstrument(
  'keys_piano',
  'Grand Piano',
  'Keys',
  'Piano',
  'splendid_grand_lite',
  {mood: ['natural', 'bright'], genre: ['pop', 'cinematic'], energy: 'medium'},
);

export const KEYS_ELECTRIC = fourOsc(
  'keys_electric',
  'Electric Keys',
  'Keys',
  'Electric Piano',
  'electric_keys',
  [preset('electric_keys', 'Electric Keys', 'Keys', 'Electric Piano')],
  {mood: ['smooth', 'warm'], genre: ['rnb', 'pop', 'soul'], energy: 'medium'},
);

export const KEYS_ORGAN = fourOsc(
  'keys_organ',
  'Organ',
  'Keys',
  'Organ',
  'organ_drawbar',
  [preset('organ_drawbar', 'Drawbar Organ', 'Keys', 'Organ')],
  {mood: ['warm', 'vintage'], genre: ['soul', 'rock', 'gospel'], energy: 'medium'},
);

export const ELECTRIC_BASS = sampleInstrument(
  'bass_growly',
  'Electric Bass',
  'Bass',
  'Electric Bass',
  'growly_bass_lite',
  {mood: ['natural', 'warm'], genre: ['pop', 'rock', 'hiphop'], energy: 'medium'},
);

export const SYNTH_BASS = fourOsc(
  'synth_bass',
  'Synth Bass',
  'Bass',
  'Synth Bass',
  'bass_sub',
  [
    preset('bass_sub', 'Sub Bass', 'Bass', 'Synth Bass'),
    preset('808_sub', '808 Sub', 'Bass', '808'),
  ],
  {mood: ['dark', 'heavy'], genre: ['electronic', 'hiphop', 'trap'], energy: 'medium'},
);

export const ELECTRIC_GUITAR = sampleInstrument(
  'guitar_emily',
  'Electric Guitar',
  'Guitar',
  'Electric Guitar',
  'emily_guitar_lite',
  {mood: ['dry', 'direct'], genre: ['pop', 'rock'], energy: 'medium'},
);

export const SYNTH_LEAD = fourOsc(
  'synth_lead',
  'Synth Lead',
  'Lead',
  'Synth Lead',
  'pop_lead',
  [
    preset('pop_lead', 'Pop Lead', 'Lead', 'Synth Lead'),
    preset('pluck_bright', 'Bright Pluck', 'Lead', 'Pluck'),
  ],
  {mood: ['bright'], genre: ['pop', 'electronic'], energy: 'high'},
);

export const SYNTH_PAD = fourOsc(
  'synth_pad',
  'Synth Pad',
  'Pad',
  'Synth Pad',
  'warm_pad',
  [preset('warm_pad', 'Warm Pad', 'Pad', 'Synth Pad')],
  {mood: ['warm', 'dreamy'], genre: ['pop', 'ambient'], energy: 'low'},
);

export const STRINGS_ENSEMBLE = fourOsc(
  'strings_ensemble',
  'String Ensemble',
  'Strings',
  'String Ensemble',
  'string_ensemble',
  [preset('string_ensemble', 'String Ensemble', 'Strings', 'String Ensemble')],
  {mood: ['cinematic', 'lush'], genre: ['cinematic', 'pop'], energy: 'medium'},
);

export const WIND_FLUTE = fourOsc(
  'winds_flute',
  'Airy Flute',
  'Winds',
  'Woodwinds',
  'airy_flute',
  [preset('airy_flute', 'Airy Flute', 'Winds', 'Woodwinds')],
  {mood: ['breathy', 'light'], genre: ['cinematic', 'ambient'], energy: 'low'},
);

export const BRASS_STACK = fourOsc(
  'brass_stack',
  'Brass Stack',
  'Brass',
  'Brass Stack',
  'brass_stack',
  [preset('brass_stack', 'Brass Stack', 'Brass', 'Brass Stack')],
  {mood: ['bold', 'bright'], genre: ['cinematic', 'pop'], energy: 'high'},
);

export const BELL_MALLETS = fourOsc(
  'bell_mallets',
  'Bells',
  'Mallets',
  'Bells',
  'bell_mallet',
  [preset('bell_mallet', 'Bell Mallet', 'Mallets', 'Bells')],
  {mood: ['glassy', 'bright'], genre: ['pop', 'ambient'], energy: 'medium'},
);

export const SAMPLER_SLICES_INSTRUMENT: InstrumentDefinition = {
  id: SAMPLER_SLICES_INSTRUMENT_ID,
  label: 'Sliced Sampler',
  category: 'Sampler',
  subcategory: 'Sliced Audio',
  nativeInstrument: 'sample_instrument',
  defaultPresetId: SAMPLER_SLICES_PRESET_ID,
  presets: [preset(SAMPLER_SLICES_PRESET_ID, 'Sliced Sampler', 'Sampler', 'Sliced Audio')],
  tags: {mood: ['chopped'], genre: ['hiphop', 'electronic'], energy: 'medium'},
};

export const DRUM_MACHINE_INSTRUMENT: InstrumentDefinition = {
  id: 'drum_machine_pop',
  label: 'Drum Machine',
  category: 'Drums',
  subcategory: 'Drum Kit',
  nativeInstrument: 'sample_kit',
  defaultPresetId: POP_BASIC_DRUM_KIT.id,
  presets: [preset(POP_BASIC_DRUM_KIT.id, 'Pop Basic', 'Drums', 'Drum Kit')],
  sampleKitId: POP_BASIC_DRUM_KIT.id,
  tags: {mood: ['energetic'], genre: ['pop', 'electronic'], energy: 'high'},
};

export const VOICE_AUDIO_INSTRUMENT: InstrumentDefinition = {
  id: 'voice_audio',
  label: 'Voice / Audio',
  category: 'Audio',
  subcategory: 'Voice',
  nativeInstrument: 'sample_kit',
  defaultPresetId: 'voice',
  presets: [preset('voice', 'Voice', 'Audio', 'Voice')],
};

export const VIRTUAL_INSTRUMENTS: InstrumentDefinition[] = [
  KEYS_PIANO,
  KEYS_ELECTRIC,
  KEYS_ORGAN,
  ELECTRIC_BASS,
  SYNTH_BASS,
  ELECTRIC_GUITAR,
  SYNTH_LEAD,
  SYNTH_PAD,
  STRINGS_ENSEMBLE,
  WIND_FLUTE,
  BRASS_STACK,
  BELL_MALLETS,
];

export const INSTRUMENTS: InstrumentDefinition[] = [
  ...VIRTUAL_INSTRUMENTS,
  SAMPLER_SLICES_INSTRUMENT,
  DRUM_MACHINE_INSTRUMENT,
  VOICE_AUDIO_INSTRUMENT,
];

function categoryIndex(category: InstrumentCategory): number {
  const index = CATEGORY_ORDER.indexOf(category);
  return index === -1 ? CATEGORY_ORDER.length : index;
}

function subcategoryIndex(subcategory: InstrumentSubcategory): number {
  const index = SUBCATEGORY_ORDER.indexOf(subcategory);
  return index === -1 ? SUBCATEGORY_ORDER.length : index;
}

export function buildInstrumentTaxonomy(
  instruments: InstrumentDefinition[] = VIRTUAL_INSTRUMENTS,
): InstrumentTaxonomyCategory[] {
  const categories = new Map<InstrumentCategory, Map<InstrumentSubcategory, InstrumentPreset[]>>();
  instruments.forEach(instrument => {
    instrument.presets.forEach(item => {
      const subcategories = categories.get(item.category) ?? new Map();
      const presets = subcategories.get(item.subcategory) ?? [];
      presets.push(item);
      subcategories.set(item.subcategory, presets);
      categories.set(item.category, subcategories);
    });
  });

  return [...categories.entries()]
    .sort(([left], [right]) => categoryIndex(left) - categoryIndex(right))
    .map(([heading, subcategories]) => ({
      heading,
      subcategories: [...subcategories.entries()]
        .sort(([left], [right]) => subcategoryIndex(left) - subcategoryIndex(right))
        .map(([subHeading, items]): InstrumentTaxonomySubcategory => ({
          heading: subHeading,
          items: items.map(item => ({
            instrumentId: instruments.find(instrument =>
              instrument.presets.some(p => p.id === item.id),
            )?.id ?? '',
            presetId: item.id,
            label: item.label,
            category: item.category,
            subcategory: item.subcategory,
          })),
        })),
    }));
}

export const INSTRUMENT_TAXONOMY = buildInstrumentTaxonomy();
export const FOUR_OSC_INSTRUMENT = SYNTH_LEAD;
