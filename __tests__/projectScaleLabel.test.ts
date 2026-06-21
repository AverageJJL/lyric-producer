import {normalizeSectionMarker, projectScaleLabel} from '../src/store/projectMetadata';

describe('projectScaleLabel', () => {
  it('renders empty for the no-key default (null)', () => {
    expect(projectScaleLabel(null)).toBe('');
  });

  it('renders a real key as "<root> <Maj|Min>"', () => {
    expect(projectScaleLabel({root: 'A', mode: 'minor'})).toBe('A Min');
    expect(projectScaleLabel({root: 'C', mode: 'major'})).toBe('C Maj');
    expect(projectScaleLabel({root: 'F#', mode: 'minor'})).toBe('F# Min');
  });

  it('does not fabricate a key from a malformed scale value', () => {
    // A bad agent-supplied value (string, or wrong-shaped object) must read as "no key",
    // not silently become "C Maj" — otherwise an unapplied key edit looks applied.
    expect(projectScaleLabel('A minor' as unknown as never)).toBe('');
    expect(projectScaleLabel({mode: 'minor'} as unknown as never)).toBe('');
    expect(projectScaleLabel({root: '', mode: 'minor'} as never)).toBe('');
  });
});

describe('section marker chord progression metadata', () => {
  it('normalizes optional verified chord progression data', () => {
    const section = normalizeSectionMarker({
      id: 'verse',
      name: 'Verse',
      startBeat: 0,
      lengthBeats: 16,
      analysis: {
        mood: 'focused',
        key: 'A minor',
        meaning: 'The lyric turns inward.',
        productionCue: 'dry drums',
        lyricPreview: ['line one'],
        chordProgression: {
          source: 'manual',
          chords: ['Am', 'F', 'C', 'G'],
          confidence: 1.4,
        },
      },
    });

    expect(section?.analysis?.chordProgression).toEqual({
      source: 'manual',
      chords: ['Am', 'F', 'C', 'G'],
      confidence: 1,
    });
  });

  it('normalizes optional lyric section source metadata', () => {
    const section = normalizeSectionMarker({
      id: 'chorus',
      name: 'Chorus',
      startBeat: 0,
      lengthBeats: 16,
      analysis: {
        mood: 'open',
        key: 'C major',
        meaning: 'The hook lands.',
        productionCue: 'wide vocals',
        lyricPreview: ['Baby, baby'],
        sectionSource: 'repetition',
        sectionConfidence: 1.4,
      },
    });

    expect(section?.analysis?.sectionSource).toBe('repetition');
    expect(section?.analysis?.sectionConfidence).toBe(1);
  });
});
