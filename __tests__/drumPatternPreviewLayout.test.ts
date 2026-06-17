import {createEmptyPattern} from '../src/music/drumPatterns';
import {drumPatternDotsLayout} from '../src/music/drumPatternPreviewLayout';
import {PIXELS_PER_BEAT} from '../src/ui/timelineLayout';

describe('drumPatternDotsLayout', () => {
  const pattern = createEmptyPattern('Test', 'pat-1');
  pattern.steps.kick[0] = true;
  pattern.steps.snare[4] = true;

  it('places hits on fixed beat pixels', () => {
    const dots = drumPatternDotsLayout(pattern, 4, 80);
    const kick = dots.find(dot => dot.key.endsWith('-kick-0'));
    expect(kick?.left).toBe(0);
    expect(kick?.width).toBe(PIXELS_PER_BEAT * 0.25 - 1);
  });

  it('does not stretch first-bar hits when clip length doubles', () => {
    const short = drumPatternDotsLayout(pattern, 4, 80);
    const long = drumPatternDotsLayout(pattern, 8, 80);
    const shortKick = short.find(dot => dot.key === '0-kick-0');
    const longKick = long.find(dot => dot.key === '0-kick-0');
    expect(shortKick?.left).toBe(longKick?.left);
    expect(long.length).toBeGreaterThan(short.length);
  });

  it('dims every repeated bar after the first when the clip is looped', () => {
    const committed = drumPatternDotsLayout(pattern, 8, 80);
    expect(committed.find(dot => dot.key === '0-kick-0')?.looped).toBe(false);
    expect(committed.find(dot => dot.key === '1-kick-0')?.looped).toBe(true);
  });

  it('dims only beats beyond the committed length during resize preview', () => {
    const preview = drumPatternDotsLayout(pattern, 8, 80, undefined, {dimmedFromBeat: 4});
    const kickBar0 = preview.find(dot => dot.key === '0-kick-0');
    const kickBar1 = preview.find(dot => dot.key === '1-kick-0');
    expect(kickBar0?.looped).toBe(false);
    expect(kickBar1?.looped).toBe(true);
  });
});
