import {createSongIdeaAnalysis} from '../src/onboarding/songIdeaAnalysis';
import {mergeReferenceMetadata, mergeSectionEnrichment} from '../src/web/components/songIdeaFlowHelpers';

function baseAnalysis() {
  return createSongIdeaAnalysis({
    track: {id: 'mxm-1', title: 'Baby', artist: 'Justin Bieber', hasLyrics: true, source: 'musixmatch'},
    lyrics: 'Baby line',
    bpmKey: {
      ok: true,
      title: 'Baby',
      artist: 'Justin Bieber',
      bpm: 130,
      key: 'C major',
      source: 'getsongbpm',
      confidence: 0.7,
      candidates: [],
    },
  });
}

function reference(key: string) {
  return {
    provider: 'cyanite' as const,
    libraryTrackId: 'cyanite-baby',
    bpm: 129,
    key,
    moodTags: [],
    moodAdvancedTags: [],
    movementTags: [],
    characterTags: [],
    genreTags: [],
    subgenreTags: [],
    instrumentTags: [],
    voiceTags: [],
    freeGenreTags: [],
    segments: [],
  };
}

describe('song idea Cyanite metadata helpers', () => {
  it.each(['Eb major', 'ebMajor', 'EB_MAJOR', 'E_FLAT_MAJOR', 'D_SHARP_MAJOR'])('normalizes Cyanite flat key %s', key => {
    expect(mergeReferenceMetadata(baseAnalysis(), reference(key)).scale).toEqual({root: 'Eb', mode: 'major'});
  });

  it('normalizes compact Cyanite sharp minor enum keys', () => {
    expect(mergeReferenceMetadata(baseAnalysis(), reference('fsMinor')).scale).toEqual({root: 'F#', mode: 'minor'});
  });

  it('preserves Cyanite BPM/key when section enrichment arrives later', () => {
    const cyanite = mergeReferenceMetadata(baseAnalysis(), reference('EB_MAJOR'));
    const enriched = {
      ...baseAnalysis(),
      bpm: 90,
      scale: {root: 'C', mode: 'major'},
      sections: cyanite.sections.map(section => ({...section, mood: 'web enriched'})),
    };

    expect(mergeSectionEnrichment(cyanite, enriched)).toMatchObject({
      bpm: 129,
      scale: {root: 'Eb', mode: 'major'},
      bpmKey: {source: 'cyanite'},
    });
  });
});
