import {
  BRASS_STACK,
  DRUM_MACHINE_INSTRUMENT,
  ELECTRIC_GUITAR,
  KEYS_ORGAN,
  STRINGS_ENSEMBLE,
  SYNTH_BASS,
  SYNTH_LEAD,
  SYNTH_PAD,
  VOICE_AUDIO_INSTRUMENT,
} from '../src/music/instruments';
import {POP_BASIC_DRUM_KIT} from '../src/music/sampleCatalog';
import {
  resolveInstrumentTag,
  sampleSuggestionsForInstrumentTag,
} from '../src/orchestration/instrumentTagMapping';

describe('AI instrument tag mapping', () => {
  it('maps explicit synth tags to catalog instrument IDs', () => {
    const result = resolveInstrumentTag({instrumentTag: 'synth_bass'});

    expect(result).toMatchObject({
      tier: 'explicit',
      templateId: 'virtual_instrument',
      instrumentId: SYNTH_BASS.id,
      presetId: SYNTH_BASS.defaultPresetId,
    });
  });

  it('maps expanded taxonomy aliases to stable instrument and preset IDs', () => {
    expect(resolveInstrumentTag({instrumentTag: '808'})).toMatchObject({
      tier: 'explicit',
      instrumentId: SYNTH_BASS.id,
      presetId: '808_sub',
    });
    expect(resolveInstrumentTag({instrumentTag: 'organ'})).toMatchObject({
      tier: 'explicit',
      instrumentId: KEYS_ORGAN.id,
      presetId: KEYS_ORGAN.defaultPresetId,
    });
    expect(resolveInstrumentTag({instrumentTag: 'strings'})).toMatchObject({
      tier: 'explicit',
      instrumentId: STRINGS_ENSEMBLE.id,
    });
    expect(resolveInstrumentTag({instrumentTag: 'brass'})).toMatchObject({
      tier: 'explicit',
      instrumentId: BRASS_STACK.id,
    });
  });

  it('keeps a known preset name when it resolves under the tagged instrument', () => {
    const result = resolveInstrumentTag({
      instrumentTag: 'lead',
      presetName: 'Bright Pluck',
    });

    expect(result).toMatchObject({
      tier: 'explicit',
      instrumentId: SYNTH_LEAD.id,
      presetId: 'pluck_bright',
    });
  });

  it('maps conversational synth bass aliases without inventing presets', () => {
    const result = resolveInstrumentTag({presetName: 'warm analog moog'});

    expect(result).toMatchObject({
      tier: 'explicit',
      instrumentId: SYNTH_BASS.id,
      presetId: SYNTH_BASS.defaultPresetId,
    });
  });

  it('maps drum sample tags to the drum machine and sample catalog', () => {
    const result = resolveInstrumentTag({instrumentTag: 'kick'});

    expect(result).toMatchObject({
      tier: 'explicit',
      templateId: 'drum_machine',
      instrumentId: DRUM_MACHINE_INSTRUMENT.id,
      presetId: POP_BASIC_DRUM_KIT.id,
      sampleKitId: POP_BASIC_DRUM_KIT.id,
      sampleId: 'kick',
    });
  });

  it('maps voice and vocal tags to the voice/audio template', () => {
    const result = resolveInstrumentTag({instrumentTag: 'vocal'});

    expect(result).toMatchObject({
      tier: 'explicit',
      templateId: 'voice_audio',
      instrumentId: VOICE_AUDIO_INSTRUMENT.id,
      presetId: VOICE_AUDIO_INSTRUMENT.defaultPresetId,
    });
  });

  it('infers a pad from ambient mood and genre context', () => {
    const result = resolveInstrumentTag({
      instrumentTag: 'unsupported texture',
      context: {
        text: 'warm dreamy ambient bed',
        mood: ['warm'],
        genre: ['ambient'],
        energy: 'low',
      },
    });

    expect(result).toMatchObject({
      tier: 'contextual',
      templateId: 'virtual_instrument',
      instrumentId: SYNTH_PAD.id,
      presetId: SYNTH_PAD.defaultPresetId,
    });
  });

  it('infers guitar from contextual text when the explicit tag is unsupported', () => {
    const result = resolveInstrumentTag({
      instrumentTag: 'jangly layer',
      context: {text: 'rock riff guitar hook'},
    });

    expect(result).toMatchObject({
      tier: 'contextual',
      instrumentId: ELECTRIC_GUITAR.id,
      presetId: ELECTRIC_GUITAR.defaultPresetId,
    });
  });

  it('falls back to the default lead when no tag or context matches', () => {
    const result = resolveInstrumentTag({instrumentTag: 'unmapped nebula'});

    expect(result).toMatchObject({
      tier: 'fallback',
      templateId: 'virtual_instrument',
      instrumentId: SYNTH_LEAD.id,
      presetId: SYNTH_LEAD.defaultPresetId,
    });
  });

  it('suggests drum samples from tag-like context words', () => {
    const suggestions = sampleSuggestionsForInstrumentTag({
      context: {text: 'tight hihat with clap accents'},
    }).map(sample => sample.id);

    expect(suggestions).toEqual(expect.arrayContaining([
      'hatClosed',
      'hatOpen',
      'clap',
    ]));
  });
});
