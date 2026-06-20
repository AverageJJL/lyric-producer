import {
  analyzeSongSeed,
  validateSongSeedModelSections,
} from '../electron/songSeedAnalysis';
import {
  createSongIdeaAnalysis,
  sectionsFromSongIdea,
} from '../src/onboarding/songIdeaAnalysis';

const lines = ['Line one', 'Line two', 'Line three'];

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

describe('song seed analysis validation', () => {
  it('accepts model sections with lyric ranges and production analysis', () => {
    expect(validateSongSeedModelSections({
      sections: [{
        name: 'Verse',
        startLine: 0,
        endLine: 1,
        bars: 4,
        mood: 'tense',
        meaning: 'A conflict starts.',
        productionDrivers: ['tight drums', 'dry vocal'],
        productionCue: 'tight drums, dry vocal',
        producerInsight: {
          intent: 'Keep the verse intimate while the conflict sharpens.',
          arrangementMove: 'Use tight kick and clipped percussion to keep pressure under the line.',
          vocalTreatment: 'Keep the lead dry with one tucked double on the last phrase.',
          soundPalette: 'tight drums, dry vocal, muted guitar',
          mixFocus: 'Push the lead vocal and transient detail forward.',
          risk: 'Do not widen the section before the hook arrives.',
        },
        confidence: 0.8,
      }],
    }, lines)).toEqual([expect.objectContaining({
      name: 'Verse',
      lyrics: ['Line one', 'Line two'],
      productionDrivers: ['tight drums', 'dry vocal'],
      producerInsight: expect.objectContaining({
        arrangementMove: expect.stringContaining('tight kick'),
        risk: expect.stringContaining('hook'),
      }),
    })]);
  });

  it('fills producer insight when model output omits it', () => {
    const sections = validateSongSeedModelSections({
      sections: [{
        name: 'Chorus',
        startLine: 0,
        endLine: 2,
        mood: 'open',
        meaning: 'The hook releases the lyric.',
        productionDrivers: ['wide drums'],
      }],
    }, lines);
    expect(sections?.[0].producerInsight).toEqual(expect.objectContaining({
      intent: expect.stringContaining('remember'),
      vocalTreatment: expect.stringContaining('Stack doubles'),
    }));
  });

  it('falls back when producer insight is malformed', () => {
    const sections = validateSongSeedModelSections({
      sections: [{
        name: 'Bridge',
        startLine: 0,
        endLine: 1,
        mood: 'suspended',
        meaning: 'The song turns before the final hook.',
        productionDrivers: ['filtered drums'],
        producerInsight: {intent: 'bad'},
      }],
    }, lines);
    expect(sections?.[0].producerInsight).toEqual(expect.objectContaining({
      intent: expect.stringContaining('contrast'),
      risk: expect.stringContaining('another verse'),
    }));
  });

  it('rejects overlapping lyric ranges', () => {
    expect(validateSongSeedModelSections({
      sections: [
        {name: 'Verse', startLine: 0, endLine: 1, mood: 'tense', meaning: 'A', productionDrivers: ['drums']},
        {name: 'Chorus', startLine: 1, endLine: 2, mood: 'open', meaning: 'B', productionDrivers: ['synths']},
      ],
    }, lines)).toBeNull();
  });

  it('rejects sections missing mood or meaning', () => {
    expect(validateSongSeedModelSections({
      sections: [{name: 'Verse', startLine: 0, endLine: 1, productionDrivers: ['drums']}],
    }, lines)).toBeNull();
  });

  it('falls back when OpenRouter is missing', async () => {
    await expect(analyzeSongSeed({
      track: {id: '1', title: 'Sketch', artist: 'Test Artist', hasLyrics: true, source: 'musixmatch'},
      lyrics: lines.join('\n'),
    }, {}, jest.fn() as typeof fetch)).resolves.toMatchObject({
      ok: true,
      source: 'fallback',
      analysis: {sections: expect.any(Array)},
    });
  });

  it('falls back when OpenRouter analysis times out', async () => {
    await expect(analyzeSongSeed({
      track: {id: '1', title: 'Sketch', artist: 'Test Artist', hasLyrics: true, source: 'musixmatch'},
      lyrics: lines.join('\n'),
    }, {
      OPENROUTER_API_KEY: 'openrouter',
      OPENROUTER_ANALYSIS_TIMEOUT_MS: '5',
    }, jest.fn(() => new Promise<Response>(() => undefined)) as typeof fetch)).resolves.toMatchObject({
      ok: true,
      source: 'fallback',
      warning: 'OpenRouter analysis failed.',
    });
  });
});
