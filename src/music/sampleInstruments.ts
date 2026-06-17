export type SampleInstrumentRegion = {
  name: string;
  relativePath: string;
  rootNote: number;
  minNote: number;
  maxNote: number;
  gainDb?: number;
  /** Optional source window for AI/transient slicing; native C++ reads only this segment. */
  sourceStartSeconds?: number;
  sourceEndSeconds?: number;
};

export type SampleInstrumentDefinition = {
  id: string;
  label: string;
  source: string;
  license: string;
  samples: SampleInstrumentRegion[];
};

export const SAMPLER_SLICES_INSTRUMENT_ID = 'sampler_slices';
export const SAMPLER_SLICES_PRESET_ID = 'ai_sliced_sampler';

const pianoPath = (file: string) => `instruments/piano/splendid-grand/${file}`;
const bassPath = (file: string) => `instruments/bass/growlybass/${file}`;
const guitarPath = (file: string) => `instruments/guitar/emilyguitar/${file}`;

const SPLENDID_GRAND: SampleInstrumentDefinition = {
  id: 'splendid_grand_lite',
  label: 'Grand Piano',
  source: 'Splendid Grand Piano by AKAI / SFZ Instruments',
  license: 'Public Domain',
  samples: [
    {
      name: 'Piano C2',
      relativePath: pianoPath('FF C2.flac'),
      rootNote: 36,
      minNote: 24,
      maxNote: 38,
      gainDb: -9,
    },
    {
      name: 'Piano F2',
      relativePath: pianoPath('FF F2.flac'),
      rootNote: 41,
      minNote: 39,
      maxNote: 43,
      gainDb: -9,
    },
    {
      name: 'Piano A2',
      relativePath: pianoPath('FF A2.flac'),
      rootNote: 45,
      minNote: 44,
      maxNote: 46,
      gainDb: -9,
    },
    {
      name: 'Piano C3',
      relativePath: pianoPath('FF C3.flac'),
      rootNote: 48,
      minNote: 47,
      maxNote: 50,
      gainDb: -9,
    },
    {
      name: 'Piano F3',
      relativePath: pianoPath('FF F3.flac'),
      rootNote: 53,
      minNote: 51,
      maxNote: 55,
      gainDb: -9,
    },
    {
      name: 'Piano A3',
      relativePath: pianoPath('FF A3.flac'),
      rootNote: 57,
      minNote: 56,
      maxNote: 58,
      gainDb: -9,
    },
    {
      name: 'Piano C4',
      relativePath: pianoPath('FF C4.flac'),
      rootNote: 60,
      minNote: 59,
      maxNote: 62,
      gainDb: -9,
    },
    {
      name: 'Piano E4',
      relativePath: pianoPath('FF E4.flac'),
      rootNote: 64,
      minNote: 63,
      maxNote: 65,
      gainDb: -9,
    },
    {
      name: 'Piano G4',
      relativePath: pianoPath('FF G4.flac'),
      rootNote: 67,
      minNote: 66,
      maxNote: 70,
      gainDb: -9,
    },
    {
      name: 'Piano D5',
      relativePath: pianoPath('FF D5.flac'),
      rootNote: 74,
      minNote: 71,
      maxNote: 84,
      gainDb: -9,
    },
  ],
};

const GROWLY_BASS: SampleInstrumentDefinition = {
  id: 'growly_bass_lite',
  label: 'Electric Bass',
  source: 'Growlybass by Karoryfer Samples',
  license: 'CC0-1.0',
  samples: [
    {
      name: 'Bass Db2',
      relativePath: bassPath('db2_f_rr1.wav'),
      rootNote: 37,
      minNote: 33,
      maxNote: 38,
      gainDb: -5,
    },
    {
      name: 'Bass E2',
      relativePath: bassPath('e2_f_rr1.wav'),
      rootNote: 40,
      minNote: 39,
      maxNote: 40,
      gainDb: -5,
    },
    {
      name: 'Bass Gb2',
      relativePath: bassPath('gb2_f_rr1.wav'),
      rootNote: 42,
      minNote: 41,
      maxNote: 43,
      gainDb: -5,
    },
    {
      name: 'Bass A2',
      relativePath: bassPath('a2_f_rr1.wav'),
      rootNote: 45,
      minNote: 44,
      maxNote: 46,
      gainDb: -5,
    },
    {
      name: 'Bass C3',
      relativePath: bassPath('c3_f_rr1.wav'),
      rootNote: 48,
      minNote: 47,
      maxNote: 49,
      gainDb: -5,
    },
    {
      name: 'Bass Eb3',
      relativePath: bassPath('eb3_f_rr1.wav'),
      rootNote: 51,
      minNote: 50,
      maxNote: 52,
      gainDb: -5,
    },
    {
      name: 'Bass Gb3',
      relativePath: bassPath('gb3_f_rr1.wav'),
      rootNote: 54,
      minNote: 53,
      maxNote: 55,
      gainDb: -5,
    },
    {
      name: 'Bass A3',
      relativePath: bassPath('a3_f_rr1.wav'),
      rootNote: 57,
      minNote: 56,
      maxNote: 61,
      gainDb: -5,
    },
  ],
};

const EMILY_GUITAR: SampleInstrumentDefinition = {
  id: 'emily_guitar_lite',
  label: 'Electric Guitar',
  source: 'Emilyguitar by Karoryfer Samples',
  license: 'CC0-1.0',
  samples: [
    {
      name: 'Guitar A2',
      relativePath: guitarPath('a2_mf_rr1.wav'),
      rootNote: 45,
      minNote: 40,
      maxNote: 46,
      gainDb: -4,
    },
    {
      name: 'Guitar C3',
      relativePath: guitarPath('c3_mf_rr1.wav'),
      rootNote: 48,
      minNote: 47,
      maxNote: 53,
      gainDb: -4,
    },
    {
      name: 'Guitar A3',
      relativePath: guitarPath('a3_mf_rr1.wav'),
      rootNote: 57,
      minNote: 54,
      maxNote: 58,
      gainDb: -4,
    },
    {
      name: 'Guitar C4',
      relativePath: guitarPath('c4_mf_rr1.wav'),
      rootNote: 60,
      minNote: 59,
      maxNote: 65,
      gainDb: -4,
    },
    {
      name: 'Guitar A4',
      relativePath: guitarPath('a4_mf_rr1.wav'),
      rootNote: 69,
      minNote: 66,
      maxNote: 70,
      gainDb: -4,
    },
    {
      name: 'Guitar C5',
      relativePath: guitarPath('c5_mf_rr1.wav'),
      rootNote: 72,
      minNote: 71,
      maxNote: 84,
      gainDb: -4,
    },
  ],
};

export const SAMPLE_INSTRUMENTS: SampleInstrumentDefinition[] = [
  SPLENDID_GRAND,
  GROWLY_BASS,
  EMILY_GUITAR,
];

export function sampleInstrumentById(
  id: string,
): SampleInstrumentDefinition | undefined {
  return SAMPLE_INSTRUMENTS.find(instrument => instrument.id === id);
}

export function buildSampleInstrumentRegions(
  id: string,
): SampleInstrumentRegion[] {
  return sampleInstrumentById(id)?.samples ?? [];
}
