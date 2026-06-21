import {
  analyzeLyricProducerSection,
  estimateLyricSyllables,
} from '../src/web/components/lyricProducerAnalysis';

describe('lyric producer analysis', () => {
  it('estimates lyric syllables from word vowel groups', () => {
    expect(estimateLyricSyllables('remember those walls')).toBe(5);
    expect(estimateLyricSyllables('I')).toBe(1);
    expect(estimateLyricSyllables('')).toBe(0);
  });

  it('groups end rhymes into a compact rhyme scheme', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Verse',
      lines: [
        {text: 'driving through the night'},
        {text: 'looking for a light'},
        {text: 'standing here alone'},
        {text: 'turning into stone'},
      ],
    });

    expect(analysis.rhymeScheme).toBe('A A B B');
    expect(analysis.rhymeDensity).toBe(1);
    expect(analysis.lines.map(line => line.endWord)).toEqual(['night', 'light', 'alone', 'stone']);
    expect(analysis.lines.every(line => line.rhymeKind === 'exact')).toBe(true);
  });

  it('ignores trailing parenthetical ad-libs when finding end rhymes', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Pre-Chorus',
      lines: [
        {text: 'And we will never, ever be apart (uh-huh)'},
        {text: 'You already broke my heart'},
      ],
    });

    expect(analysis.rhymeScheme).toBe('A A');
    expect(analysis.lines.map(line => line.endWord)).toEqual(['apart', 'heart']);
  });

  it('labels loose endings as slant rhymes instead of exact rhymes', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Verse',
      lines: [
        {text: 'Girl, quit playin'},
        {text: 'What are you sayin'},
        {text: 'Looked right in my eyes'},
        {text: 'For the very first time'},
        {text: 'I stood alone'},
      ],
    });

    expect(analysis.rhymeScheme).toBe('A A B B -');
    expect(analysis.lines.map(line => line.rhymeKind)).toEqual(['slant', 'slant', 'slant', 'slant', 'none']);
  });

  it('can mark a rhyme that only resolves against neighboring section context', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Pre-Chorus',
      lines: [{text: 'And we will never, ever be apart'}],
      context: [{sectionName: 'Verse 1', lines: [{text: 'You already broke my heart'}]}],
    });

    expect(analysis.rhymeScheme).toBe('A');
    expect(analysis.lines[0]).toMatchObject({
      rhymeKind: 'context',
      contextSectionName: 'Verse 1',
    });
  });

  it('flags dense and uneven sections with producer cues', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Verse',
      lines: [
        {text: 'go now'},
        {text: 'everybody in the room can see the pressure rising over everything I never said aloud tonight'},
        {text: 'stay'},
      ],
    });

    expect(analysis.flags).toEqual(expect.arrayContaining(['dense line', 'uneven cadence']));
    expect(analysis.cues.join(' ')).toContain('Leave drums and bass simpler');
  });

  it('recognizes short hook sections as arrangement opportunities', () => {
    const analysis = analyzeLyricProducerSection({
      sectionName: 'Chorus',
      lines: [{text: 'come back'}, {text: 'come back'}],
    });

    expect(analysis.flags).toContain('short hook');
    expect(analysis.cues.join(' ')).toContain('doubles');
  });
});
