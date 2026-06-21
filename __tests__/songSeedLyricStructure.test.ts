import {analyzeSongSeed} from '../electron/songSeedAnalysis';
import type {SongSeedLyricStructure} from '../electron/songSeedProviders';
import {createSongIdeaAnalysis, sectionsFromSongIdea} from '../src/onboarding/songIdeaAnalysis';

const babyTrack = {
  id: 'mxm-baby',
  title: 'Baby',
  artist: 'Justin Bieber',
  hasLyrics: true,
  hasTrackStructure: true,
  source: 'musixmatch' as const,
};

const babyLines = [
  'Oh, woah',
  'Oh, woah',
  'Oh, woah',
  'You know you love me (Yo), I know you care (Uh-huh)',
  'Just shout whenever (Yo), and I will be there (Uh-huh)',
  'You are my love (Yo), you are my heart (Uh-huh)',
  'And we will never, ever, ever be apart (Yo, uh-huh)',
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
  'I am going down, down, down, down',
  'Baby, baby, baby, oh',
  'Like baby, baby, baby, no',
  'Like baby, baby, baby, oh',
  'I thought you would always be mine',
];

const babyLyrics = babyLines.join('\n');

const babyStructure: SongSeedLyricStructure = {
  intro: [0, 1, 2],
  verse: [3, 4, 5, 6, 7, 8, 9, 10, 15, 16, 17],
  chorus: [11, 12, 13, 14, 18, 19, 20, 21],
};

describe('Musixmatch lyric structure sectioning', () => {
  it('keeps Baby-style intro, verse, chorus, and stray verse lines in indexed sections', async () => {
    const response = await analyzeSongSeed(
      {track: babyTrack, lyrics: babyLyrics, lyricStructure: babyStructure},
      {},
      jest.fn() as typeof fetch,
    );
    expect(response.ok).toBe(true);
    if (!response.ok) throw new Error(response.error);

    const [intro, verse1, chorus1, verse2, chorus2] = response.analysis.sections;
    expect(response.analysis.sections.map(section => section.name)).toEqual([
      'Intro',
      'Verse 1',
      'Chorus 1',
      'Verse 2',
      'Chorus 2',
    ]);
    expect(intro?.lyrics).toEqual(['Oh, woah', 'Oh, woah', 'Oh, woah']);
    expect(verse1?.lyrics[0]).toBe('You know you love me (Yo), I know you care (Uh-huh)');
    expect(chorus1?.lyrics[0]).toBe('Baby, baby, baby, oh');
    expect(verse2?.lyrics).toEqual([
      'For you, I would have done whatever',
      'And I just cannot believe we are not together',
      'I am going down, down, down, down',
    ]);
    expect(chorus2?.lyrics[0]).toBe('Baby, baby, baby, oh');
    expect(response.analysis.sections.every(section => section.sectionSource === 'musixmatch-structure')).toBe(true);
  });

  it('uses Musixmatch structure in renderer song idea startup markers', () => {
    const analysis = createSongIdeaAnalysis({track: babyTrack, lyrics: babyLyrics, lyricStructure: babyStructure});
    const markers = sectionsFromSongIdea(analysis);

    expect(analysis.sections.map(section => section.name)).toEqual(['Intro', 'Verse 1', 'Chorus 1', 'Verse 2', 'Chorus 2']);
    expect(markers.find(marker => marker.name === 'Intro')?.analysis).toMatchObject({
      sectionSource: 'musixmatch-structure',
      sectionConfidence: 0.99,
      lyrics: ['Oh, woah', 'Oh, woah', 'Oh, woah'],
    });
  });

  it('keeps repeated adlib openers as intro when provider structure is unavailable', () => {
    const analysis = createSongIdeaAnalysis({track: babyTrack, lyrics: babyLyrics});

    expect(analysis.sections.map(section => section.name)).toEqual([
      'Intro',
      'Verse 1',
      'Chorus 1',
      'Verse 2',
      'Chorus 2',
    ]);
    expect(analysis.sections[0]?.lyrics).toEqual(['Oh, woah', 'Oh, woah', 'Oh, woah']);
    expect(analysis.sections[1]?.lyrics[0]).toBe('You know you love me (Yo), I know you care (Uh-huh)');
    expect(analysis.sections[2]?.lyrics[0]).toBe('Baby, baby, baby, oh');
    expect(analysis.sections[3]?.lyrics).toEqual([
      'For you, I would have done whatever',
      'And I just cannot believe we are not together',
      'I am going down, down, down, down',
    ]);
    expect(analysis.sections.every(section => section.sectionSource === 'repetition')).toBe(true);
  });

  it('keeps hook sections distinct from chorus sections', () => {
    const analysis = createSongIdeaAnalysis({
      track: babyTrack,
      lyrics: ['Baby, baby, baby, oh', 'Like baby, baby, baby, no', 'Short shouted tag', 'Short shouted tag'].join('\n'),
      lyricStructure: {chorus: [0, 1], hook: [2, 3]},
    });

    expect(analysis.sections.map(section => section.name)).toEqual(['Chorus 1', 'Hook 1']);
    expect(analysis.sections.every(section => section.sectionSource === 'musixmatch-structure')).toBe(true);
  });
});
