import {analyzeSongSeed} from '../electron/songSeedAnalysis';
import {
  createSongIdeaAnalysis,
  sectionsFromSongIdea,
} from '../src/onboarding/songIdeaAnalysis';
import {normalizeSectionMarker} from '../src/store/projectMetadata';

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

const blankSpaceTrack = {id: 'mxm-blank-space', title: 'Blank Space', artist: 'Taylor Swift', hasLyrics: true, source: 'musixmatch' as const};
const partialBlankSpaceLyrics = 'Nice to meet you, where you been?';
const babyTrack = {id: 'mxm-baby', title: 'Baby', artist: 'Justin Bieber', hasLyrics: true, source: 'musixmatch' as const};
const babyStyleLyrics = [
  'You know you love me, I know you care',
  'Just shout whenever, and I will be there',
  'Are we an item? Girl, quit playin',
  'We are just friends, what are you sayin',
  'Said there is another and looked right in my eyes',
  'My first love broke my heart for the first time',
  'Baby, baby, baby, oh',
  'Like baby, baby, baby, no',
  'Like baby, baby, baby, oh',
  'I thought you would always be mine',
  'For you, I would have done whatever',
  'And I just cannot believe we are not together',
  'Baby, baby, baby, oh',
  'Like baby, baby, baby, no',
  'Like baby, baby, baby, oh',
  'I thought you would always be mine',
].join('\n');

describe('full song fallback structure', () => {
  it('builds full sections from partial lyrics', async () => {
    const response = await analyzeSongSeed({track: blankSpaceTrack, lyrics: partialBlankSpaceLyrics}, {}, jest.fn() as typeof fetch);
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }
    const names = response.analysis.sections.map(section => section.name);
    expect(response.analysis.sections.length).toBeGreaterThanOrEqual(8);
    expect(names).toEqual(expect.arrayContaining(['Verse 2', 'Chorus 2', 'Final Chorus', 'Outro']));
    expect(response.analysis.sections.some(section => section.lyrics.length === 0)).toBe(true);
    expect(response.analysis.sections.every(section => section.producerInsight?.arrangementMove)).toBe(true);
  });

  it('expands a too-short model response into the full structure', async () => {
    const fetchMock = jest.fn(() => okJson({
      choices: [{message: {content: JSON.stringify({sections: [{
        name: 'Verse',
        startLine: 0,
        endLine: 0,
        mood: 'tense',
        meaning: 'The narrator starts the game.',
        productionDrivers: ['dry vocal'],
        producerInsight: {
          intent: 'Keep the opening lyric close and character-led.',
          arrangementMove: 'Hold the drums back and let one dry texture answer the vocal.',
          vocalTreatment: 'Use a centered vocal with a short slap tucked low.',
          soundPalette: 'dry vocal, clipped percussion',
          mixFocus: 'Make the vocal edge and pocket the loudest details.',
          risk: 'Do not make the first section wider than the chorus.',
        },
      }]})}}],
    }));
    const response = await analyzeSongSeed(
      {track: blankSpaceTrack, lyrics: partialBlankSpaceLyrics},
      {OPENROUTER_API_KEY: 'openrouter'},
      fetchMock as typeof fetch,
    );
    expect(response.ok).toBe(true);
    if (!response.ok) {
      throw new Error(response.error);
    }
    expect(response.warning).toMatch(/expanded/);
    expect(response.analysis.sections).toHaveLength(10);
    expect(response.analysis.sections.map(section => section.name)).toContain('Final Chorus');
  });

  it('preserves every generated section when converting to DAW markers', () => {
    const analysis = createSongIdeaAnalysis({track: blankSpaceTrack, lyrics: partialBlankSpaceLyrics});
    const markers = sectionsFromSongIdea(analysis);
    expect(markers).toHaveLength(analysis.sections.length);
    expect(markers.map(marker => marker.name)).toEqual(expect.arrayContaining(['Verse 2', 'Chorus 2', 'Outro']));
    expect(markers[markers.length - 1].startBeat).toBeGreaterThan(markers[0].startBeat);
    expect(markers[0].analysis?.producerInsight?.intent).toContain('signature');
    expect(normalizeSectionMarker(markers[0])?.analysis?.producerInsight?.risk).toContain('chorus');
  });

  it('spreads available lyrics across more than three section anchors', () => {
    const lyrics = Array.from({length: 8}, (_, index) => `Blank Space line ${index + 1}`).join('\n');
    const analysis = createSongIdeaAnalysis({track: blankSpaceTrack, lyrics});
    const lyricBackedSections = analysis.sections.filter(section => section.lyrics.length > 0);
    expect(analysis.sections).toHaveLength(10);
    expect(lyricBackedSections.length).toBeGreaterThan(3);
    expect(lyricBackedSections.map(section => section.name)).toEqual(expect.arrayContaining([
      'Intro',
      'Verse 1',
      'Pre-Chorus 1',
      'Chorus 1',
      'Verse 2',
    ]));
  });

  it('creates role-specific producer notes for verses, choruses, and bridge', () => {
    const analysis = createSongIdeaAnalysis({track: blankSpaceTrack, lyrics: Array.from({length: 10}, (_, index) => `line ${index}`).join('\n')});
    const verse = analysis.sections.find(section => section.name === 'Verse 1');
    const chorus = analysis.sections.find(section => section.name === 'Chorus 1');
    const bridge = analysis.sections.find(section => section.name === 'Bridge');
    expect(verse?.producerInsight?.arrangementMove).toContain('Hold drums and bass tight');
    expect(chorus?.producerInsight?.vocalTreatment).toContain('Stack doubles');
    expect(bridge?.producerInsight?.intent).toContain('contrast');
  });

  it('detects repeated Baby-style hooks as chorus sections before model analysis', async () => {
    const response = await analyzeSongSeed({track: babyTrack, lyrics: babyStyleLyrics}, {}, jest.fn() as typeof fetch);
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);

    const verse = response.analysis.sections.find(section => section.name === 'Verse 1');
    const choruses = response.analysis.sections.filter(section => /chorus/i.test(section.name));
    expect(verse?.lyrics.join(' ')).toContain('Are we an item');
    expect(verse?.lyrics.join(' ')).not.toContain('Baby, baby, baby');
    expect(choruses).toHaveLength(2);
    expect(choruses[0]).toMatchObject({
      sectionSource: 'repetition',
      sectionConfidence: 0.9,
      lyrics: expect.arrayContaining(['Baby, baby, baby, oh']),
    });
    expect(choruses[1]?.lyrics[0]).toBe('Baby, baby, baby, oh');
  });

  it('preserves bracketed lyric headers as verified section ranges', async () => {
    const lyrics = '[Verse 1]\nQuiet setup line\n[Chorus]\nBaby, baby, baby, oh';
    const response = await analyzeSongSeed({track: babyTrack, lyrics}, {}, jest.fn() as typeof fetch);
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);

    expect(response.analysis.sections.map(section => section.name)).toEqual(['Verse 1', 'Chorus 1']);
    expect(response.analysis.sections.every(section => section.sectionSource === 'lyric-headers')).toBe(true);
    expect(response.analysis.sections[1]?.lyrics).toEqual(['Baby, baby, baby, oh']);
  });

  it('uses the same detected sections in renderer song idea startup', () => {
    const analysis = createSongIdeaAnalysis({track: babyTrack, lyrics: babyStyleLyrics});
    const markers = sectionsFromSongIdea(analysis);
    const chorus = analysis.sections.find(section => section.name === 'Chorus 1');

    expect(chorus?.lyrics[0]).toBe('Baby, baby, baby, oh');
    expect(markers.find(marker => marker.name === 'Chorus 1')?.analysis).toMatchObject({
      sectionSource: 'repetition',
      sectionConfidence: 0.9,
    });
  });
});
