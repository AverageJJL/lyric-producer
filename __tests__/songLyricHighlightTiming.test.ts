import {
  BASE_WORD_HIGHLIGHT_MS,
  MAX_SECTION_HOLD_MS,
  MIN_SECTION_HOLD_MS,
  lyricHighlightTiming,
  nextLyricSectionIndex,
} from '../src/web/components/songLyricHighlightTiming';

describe('lyricHighlightTiming', () => {
  it('keeps short lyric sections quick enough for the analysis tour', () => {
    const timing = lyricHighlightTiming(['one small line']);

    expect(timing.wordMs).toBe(BASE_WORD_HIGHLIGHT_MS);
    expect(timing.totalMs).toBeGreaterThanOrEqual(MIN_SECTION_HOLD_MS);
    expect(timing.totalMs).toBeLessThan(500);
  });

  it('compresses long sections without exceeding the maximum tour window', () => {
    const longLine = Array.from({length: 80}, (_, index) => `word${index}`).join(' ');
    const timing = lyricHighlightTiming([longLine]);

    expect(timing.wordMs).toBeLessThan(BASE_WORD_HIGHLIGHT_MS);
    expect(timing.totalMs).toBeLessThanOrEqual(MAX_SECTION_HOLD_MS);
  });

  it('skips empty lyric sections during the automatic tour', () => {
    expect(nextLyricSectionIndex([
      {lyrics: ['intro']},
      {lyrics: []},
      {lyrics: ['chorus']},
    ], 0)).toBe(2);
  });
});
