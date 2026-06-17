export type InstrumentCategory =
  | 'Keys'
  | 'Bass'
  | 'Guitar'
  | 'Lead'
  | 'Pad'
  | 'Strings'
  | 'Winds'
  | 'Brass'
  | 'Mallets'
  | 'Sampler'
  | 'Drums'
  | 'Audio';

export type InstrumentSubcategory =
  | 'Piano'
  | 'Electric Piano'
  | 'Organ'
  | 'Electric Bass'
  | 'Synth Bass'
  | '808'
  | 'Electric Guitar'
  | 'Synth Lead'
  | 'Pluck'
  | 'Synth Pad'
  | 'String Ensemble'
  | 'Woodwinds'
  | 'Brass Stack'
  | 'Bells'
  | 'Sliced Audio'
  | 'Drum Kit'
  | 'Voice';

export type NativeInstrumentId =
  | 'four_osc'
  | 'sample_kit'
  | 'sample_instrument';

export type InstrumentPreset = {
  id: string;
  label: string;
  category: InstrumentCategory;
  subcategory: InstrumentSubcategory;
};

export type InstrumentTags = {
  mood?: string[];
  genre?: string[];
  energy?: 'low' | 'medium' | 'high';
};

export type InstrumentDefinition = {
  id: string;
  label: string;
  category: InstrumentCategory;
  subcategory: InstrumentSubcategory;
  nativeInstrument: NativeInstrumentId;
  defaultPresetId: string;
  presets: InstrumentPreset[];
  tags?: InstrumentTags;
  /** For sample_kit instruments: kit id in sampleCatalog.ts. */
  sampleKitId?: string;
  /** For pitched sample instruments: id in sampleInstruments.ts. */
  sampleInstrumentId?: string;
};

export type InstrumentTaxonomyPreset = {
  instrumentId: string;
  presetId: string;
  label: string;
  category: InstrumentCategory;
  subcategory: InstrumentSubcategory;
};

export type InstrumentTaxonomySubcategory = {
  heading: InstrumentSubcategory;
  items: InstrumentTaxonomyPreset[];
};

export type InstrumentTaxonomyCategory = {
  heading: InstrumentCategory;
  subcategories: InstrumentTaxonomySubcategory[];
};

export type NativeInstrumentAssignment = {
  instrument: NativeInstrumentId;
  presetId: string;
  params: Record<string, unknown>;
};
