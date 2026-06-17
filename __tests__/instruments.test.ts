import {
  DRUM_MACHINE_INSTRUMENT,
  ELECTRIC_BASS,
  INSTRUMENT_TAXONOMY,
  instrumentForTrack,
  KEYS_PIANO,
  KEYS_ORGAN,
  resolveNativeInstrumentAssignment,
  SAMPLER_SLICES_INSTRUMENT,
  STRINGS_ENSEMBLE,
  SYNTH_BASS,
  VIRTUAL_INSTRUMENTS,
} from '../src/music/instruments';
import { POP_DRUM_KIT_ID } from '../src/assets/drumKit';
import { buildSamplePathMap } from '../src/music/sampleCatalog';
import { createTrackFromTemplate } from '../src/music/trackTemplates';

describe('instrument catalog', () => {
  it('resolves virtual instrument native assignment to four_osc', () => {
    const track = createTrackFromTemplate('virtual_instrument', 0, {
      instrumentId: SYNTH_BASS.id,
    });
    const assignment = resolveNativeInstrumentAssignment(track);
    expect(assignment?.instrument).toBe('four_osc');
    expect(assignment?.presetId).toBe('bass_sub');
  });

  it('resolves real virtual instruments to sample regions', () => {
    const piano = createTrackFromTemplate('virtual_instrument', 0, {
      instrumentId: KEYS_PIANO.id,
    });
    const pianoAssignment = resolveNativeInstrumentAssignment(piano);
    expect(pianoAssignment?.instrument).toBe('sample_instrument');
    expect(pianoAssignment?.params.samples).toHaveLength(10);

    const bass = createTrackFromTemplate('virtual_instrument', 1, {
      instrumentId: ELECTRIC_BASS.id,
    });
    const bassAssignment = resolveNativeInstrumentAssignment(bass);
    expect(bassAssignment?.instrument).toBe('sample_instrument');
    expect(bassAssignment?.params.samples).toHaveLength(8);
  });

  it('resolves custom sliced sampler regions into the native assignment payload', () => {
    const assignment = resolveNativeInstrumentAssignment({
      type: 'software_instrument',
      instrumentId: SAMPLER_SLICES_INSTRUMENT.id,
      presetId: SAMPLER_SLICES_INSTRUMENT.defaultPresetId,
      samplerRegions: [{
        name: 'Slice A',
        relativePath: 'imports/vocal.wav',
        rootNote: 48,
        minNote: 48,
        maxNote: 48,
        sourceStartSeconds: 1,
        sourceEndSeconds: 1.5,
      }],
    });

    expect(assignment).toMatchObject({
      instrument: 'sample_instrument',
      presetId: 'ai_sliced_sampler',
      params: {
        samples: [expect.objectContaining({
          relativePath: 'imports/vocal.wav',
          sourceStartSeconds: 1,
          sourceEndSeconds: 1.5,
        })],
      },
    });
  });

  it('resolves drum machine to sample_kit with sample map', () => {
    const track = createTrackFromTemplate('drum_machine', 0);
    const assignment = resolveNativeInstrumentAssignment(track);
    expect(assignment?.instrument).toBe('sample_kit');
    const samples = buildSamplePathMap(POP_DRUM_KIT_ID);
    expect(assignment?.params.samples).toEqual(samples);
    expect(Object.keys(samples)).toHaveLength(8);
    expect(samples.kick).toBe('sample-library/core-drums/kick.wav');
  });

  it('maps track types to instrument definitions', () => {
    const drum = instrumentForTrack('drum_machine', DRUM_MACHINE_INSTRUMENT.id);
    expect(drum.nativeInstrument).toBe('sample_kit');
    expect(drum.sampleKitId).toBe(POP_DRUM_KIT_ID);
  });

  it('exposes a hierarchical virtual instrument taxonomy', () => {
    expect(INSTRUMENT_TAXONOMY.map(section => section.heading)).toEqual([
      'Keys',
      'Bass',
      'Guitar',
      'Lead',
      'Pad',
      'Strings',
      'Winds',
      'Brass',
      'Mallets',
    ]);

    const keys = INSTRUMENT_TAXONOMY.find(section => section.heading === 'Keys');
    expect(keys?.subcategories.map(section => section.heading)).toEqual([
      'Piano',
      'Electric Piano',
      'Organ',
    ]);

    const allPicks = INSTRUMENT_TAXONOMY.flatMap(section =>
      section.subcategories.flatMap(subcategory => subcategory.items),
    );
    expect(allPicks).toHaveLength(14);
    expect(allPicks).toEqual(expect.arrayContaining([
      expect.objectContaining({presetId: '808_sub', subcategory: '808'}),
      expect.objectContaining({presetId: 'string_ensemble', category: 'Strings'}),
      expect.objectContaining({presetId: 'airy_flute', category: 'Winds'}),
    ]));
  });

  it('creates expanded taxonomy tracks without falling back to piano', () => {
    const organ = createTrackFromTemplate('virtual_instrument', 0, {
      instrumentId: KEYS_ORGAN.id,
      presetId: KEYS_ORGAN.defaultPresetId,
    });
    const strings = createTrackFromTemplate('virtual_instrument', 1, {
      instrumentId: STRINGS_ENSEMBLE.id,
      presetId: STRINGS_ENSEMBLE.defaultPresetId,
    });

    expect(organ.instrumentId).toBe(KEYS_ORGAN.id);
    expect(organ.presetId).toBe('organ_drawbar');
    expect(strings.instrumentId).toBe(STRINGS_ENSEMBLE.id);
    expect(strings.presetId).toBe('string_ensemble');
  });

  it('maps every virtual taxonomy preset to a native assignment', () => {
    VIRTUAL_INSTRUMENTS.forEach(instrument => {
      instrument.presets.forEach(preset => {
        const assignment = resolveNativeInstrumentAssignment({
          type: 'software_instrument',
          instrumentId: instrument.id,
          presetId: preset.id,
        });
        expect(assignment?.instrument).toBe(instrument.nativeInstrument);
        expect(assignment?.presetId).toBe(preset.id);
      });
    });
  });
});
