import {
  buildStructureSections,
  curateSampleStack,
} from '../src/arrangement/structureStacking';
import type {SampleProviderEntry} from '../src/native/mediaImportApi';

function sample(
  id: string,
  name: string,
  tags: string[],
): SampleProviderEntry {
  return {
    id,
    providerId: 'pack',
    providerLabel: 'Pack',
    name,
    absolutePath: `/tmp/${id}.wav`,
    fileBytes: 1000,
    modifiedAt: '2026-06-03T00:00:00.000Z',
    tags,
  };
}

describe('structure stacking', () => {
  it('builds beat-sketch sections from the current meter', () => {
    expect(buildStructureSections({templateId: 'beat_sketch', beatsPerBar: 3})).toEqual([
      {id: 'structure-intro-0', name: 'Intro', startBeat: 0, lengthBeats: 12},
      {id: 'structure-verse-1', name: 'Verse', startBeat: 12, lengthBeats: 24},
      {id: 'structure-hook-2', name: 'Hook', startBeat: 36, lengthBeats: 24},
      {id: 'structure-outro-3', name: 'Outro', startBeat: 60, lengthBeats: 12},
    ]);
  });

  it('curates one provider sample for each stack role', () => {
    const picks = curateSampleStack({
      query: 'dark trap',
      samples: [
        sample('pad', 'Dark Ambient Pad', ['ambient', 'pad']),
        sample('bass', 'Trap 808 Bass', ['bass', '808']),
        sample('drums', 'Trap Drum Loop', ['drum', 'loop']),
        sample('melody', 'Dark Piano Melody', ['piano', 'melody']),
      ],
    });

    expect(picks.map(pick => [pick.roleLabel, pick.sample.name])).toEqual([
      ['Drums', 'Trap Drum Loop'],
      ['Bass', 'Trap 808 Bass'],
      ['Melody', 'Dark Piano Melody'],
      ['Texture', 'Dark Ambient Pad'],
    ]);
  });
});
