import type {TrackType} from '../store/useDAWStore';
import {buildSamplePathMap} from './sampleCatalog';
import {buildSampleInstrumentRegions, type SampleInstrumentRegion} from './sampleInstruments';
import {
  DRUM_MACHINE_INSTRUMENT,
  INSTRUMENTS,
  INSTRUMENT_TAXONOMY,
  SYNTH_LEAD,
  VOICE_AUDIO_INSTRUMENT,
} from './instrumentCatalog';
import type {
  InstrumentCategory,
  InstrumentDefinition,
  InstrumentSubcategory,
  NativeInstrumentAssignment,
} from './instrumentTypes';

export type {
  InstrumentCategory,
  InstrumentDefinition,
  InstrumentPreset,
  InstrumentSubcategory,
  InstrumentTags,
  InstrumentTaxonomyCategory,
  InstrumentTaxonomyPreset,
  InstrumentTaxonomySubcategory,
  NativeInstrumentAssignment,
  NativeInstrumentId,
} from './instrumentTypes';

export {
  BELL_MALLETS,
  BRASS_STACK,
  buildInstrumentTaxonomy,
  DRUM_MACHINE_INSTRUMENT,
  ELECTRIC_BASS,
  ELECTRIC_GUITAR,
  FOUR_OSC_INSTRUMENT,
  INSTRUMENTS,
  INSTRUMENT_TAXONOMY,
  KEYS_ELECTRIC,
  KEYS_ORGAN,
  KEYS_PIANO,
  SAMPLER_SLICES_INSTRUMENT,
  STRINGS_ENSEMBLE,
  SYNTH_BASS,
  SYNTH_LEAD,
  SYNTH_PAD,
  VIRTUAL_INSTRUMENTS,
  VOICE_AUDIO_INSTRUMENT,
  WIND_FLUTE,
} from './instrumentCatalog';

export function instrumentById(
  instrumentId: string,
): InstrumentDefinition | undefined {
  return INSTRUMENTS.find(item => item.id === instrumentId);
}

export function instrumentsForCategory(
  category: InstrumentCategory,
): InstrumentDefinition[] {
  return INSTRUMENTS.filter(item => item.category === category);
}

export function instrumentsForSubcategory(
  subcategory: InstrumentSubcategory,
): InstrumentDefinition[] {
  return INSTRUMENTS.filter(item =>
    item.subcategory === subcategory ||
    item.presets.some(preset => preset.subcategory === subcategory),
  );
}

export function instrumentForTrack(
  trackType: TrackType,
  instrumentId: string,
): InstrumentDefinition {
  if (trackType === 'voice_audio') {
    return VOICE_AUDIO_INSTRUMENT;
  }
  if (trackType === 'drum_machine') {
    return instrumentById(instrumentId) ?? DRUM_MACHINE_INSTRUMENT;
  }
  return instrumentById(instrumentId) ?? SYNTH_LEAD;
}

export function presetLabel(
  instrument: InstrumentDefinition,
  presetId: string,
): string {
  return instrument.presets.find(preset => preset.id === presetId)?.label ?? presetId;
}

function resolvedPresetId(
  instrument: InstrumentDefinition,
  presetId: string | undefined,
): string {
  return presetId && instrument.presets.some(preset => preset.id === presetId)
    ? presetId
    : instrument.defaultPresetId;
}

/** Resolve engine payload for assign_track_instrument from UI track state. */
export function resolveNativeInstrumentAssignment(track: {
  type: TrackType;
  instrumentId: string;
  presetId: string;
  samplerRegions?: SampleInstrumentRegion[];
}): NativeInstrumentAssignment | null {
  if (track.type === 'voice_audio') {
    return null;
  }

  const definition = instrumentForTrack(track.type, track.instrumentId);
  const presetId = resolvedPresetId(definition, track.presetId);

  if (definition.nativeInstrument === 'four_osc') {
    return {
      instrument: 'four_osc',
      presetId,
      params: {preset: presetId},
    };
  }

  if (definition.nativeInstrument === 'sample_instrument') {
    const sampleInstrumentId = definition.sampleInstrumentId ?? presetId;
    const samples = track.samplerRegions?.length
      ? track.samplerRegions
      : buildSampleInstrumentRegions(sampleInstrumentId);
    if (samples.length === 0) {
      return null;
    }
    return {
      instrument: 'sample_instrument',
      presetId,
      params: {
        preset: presetId,
        samples,
      },
    };
  }

  const kitId = definition.sampleKitId ?? presetId;
  return {
    instrument: 'sample_kit',
    presetId,
    params: {
      preset: presetId,
      samples: buildSamplePathMap(kitId),
    },
  };
}

export function isMidiKeyboardTrackType(type: TrackType): boolean {
  return type === 'software_instrument';
}

export function isDrumMachineTrackType(type: TrackType): boolean {
  return type === 'drum_machine';
}

export function usesSampleKitEngine(type: TrackType): boolean {
  return type === 'drum_machine';
}

export function virtualInstrumentTaxonomy() {
  return INSTRUMENT_TAXONOMY;
}
