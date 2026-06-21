import {
  buildBipolarEnvelopePath,
  firstPathVertexX,
  LIVE_WAVEFORM_PIXELS_PER_PEAK,
  waveformPreviewLayout,
} from '../src/music/waveformPreviewLayout';
import {PIXELS_PER_BEAT} from '../src/ui/timelineLayout';

describe('waveformPreviewLayout', () => {
  const peaks = [0.1, 0.5, 0.9, 0.4, 0.2, 0.6, 0.3, 0.7];

  function firstPathVertexY(pathD: string): number {
    const match = pathD.match(/^M\s+[\d.]+\s+([\d.]+)/);
    return match ? Number(match[1]) : Number.NaN;
  }

  it('keeps source width fixed when visible clip length grows', () => {
    const short = waveformPreviewLayout(peaks, true, 4, 4 * PIXELS_PER_BEAT, 40, 8);
    const long = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    expect(long.sourceWidthPx).toBe(8 * PIXELS_PER_BEAT);
    expect(long.visibleWidthPx).toBe(8 * PIXELS_PER_BEAT);
    expect(short.pathD.length).toBeGreaterThan(0);
    expect(long.pathD.length).toBeGreaterThan(0);
  });

  it('shifts waveform when trim offset advances without changing path coordinates', () => {
    const trimmed = waveformPreviewLayout(peaks, true, 4, 4 * PIXELS_PER_BEAT, 40, 8, 2);
    const untrimmed = waveformPreviewLayout(peaks, true, 4, 4 * PIXELS_PER_BEAT, 40, 8, 0);
    expect(trimmed.offsetPx).toBe(2 * PIXELS_PER_BEAT);
    expect(trimmed.pathD).toBe(untrimmed.pathD);
  });

  it('places the zero baseline at the vertical center', () => {
    const layout = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 48, 8);
    expect(layout.centerY).toBe(layout.stripHeightPx / 2);
    expect(layout.centerY).toBe(24);
  });

  it('builds a closed path centered on centerY', () => {
    const layout = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    expect(layout.pathD.endsWith('Z')).toBe(true);
    expect(layout.pathD.startsWith('M')).toBe(true);
    expect(layout.pathD).toContain(' Q ');
  });

  it('keeps live peak X positions stable when more peaks arrive', () => {
    const early = [0.2, 0.8, 0.5];
    const later = [0.2, 0.8, 0.5, 0.3, 0.9, 0.4];
    const layoutEarly = waveformPreviewLayout(
      early,
      true,
      32,
      32 * PIXELS_PER_BEAT,
      40,
      32,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {liveRecording: true},
    );
    const layoutLater = waveformPreviewLayout(
      later,
      true,
      32,
      32 * PIXELS_PER_BEAT,
      40,
      32,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {liveRecording: true},
    );
    expect(firstPathVertexX(layoutEarly.pathD)).toBe(LIVE_WAVEFORM_PIXELS_PER_PEAK / 2);
    expect(firstPathVertexX(layoutLater.pathD)).toBe(firstPathVertexX(layoutEarly.pathD));
    expect(layoutLater.pathD).toContain(' Q ');
  });

  it('reverses the visual peak order when source playback is reversed', () => {
    const forward = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    const reversed = waveformPreviewLayout(
      peaks,
      true,
      8,
      8 * PIXELS_PER_BEAT,
      40,
      8,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {isReversed: true},
    );
    expect(reversed.pathD).not.toBe(forward.pathD);
  });

  it('builds fade overlays from the visible trimmed source window', () => {
    const layout = waveformPreviewLayout(
      peaks,
      true,
      4,
      4 * PIXELS_PER_BEAT,
      40,
      8,
      2,
      PIXELS_PER_BEAT,
      undefined,
      {fadeInBeats: 1, fadeOutBeats: 10},
    );

    expect(layout.fadeOverlays).toHaveLength(2);
    expect(layout.fadeOverlays[0]).toMatchObject({
      edge: 'in',
      startPx: 2 * PIXELS_PER_BEAT,
      endPx: 3 * PIXELS_PER_BEAT,
      widthPx: PIXELS_PER_BEAT,
    });
    expect(layout.fadeOverlays[1]).toMatchObject({
      edge: 'out',
      startPx: 2 * PIXELS_PER_BEAT,
      endPx: 6 * PIXELS_PER_BEAT,
      widthPx: 4 * PIXELS_PER_BEAT,
    });
  });

  it('keeps 0 dB gain visually identical to the current waveform', () => {
    const baseline = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    const unityGain = waveformPreviewLayout(
      peaks,
      true,
      8,
      8 * PIXELS_PER_BEAT,
      40,
      8,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {clipGainDb: 0},
    );
    expect(unityGain.pathD).toBe(baseline.pathD);
  });

  it('shrinks waveform height when clip gain is reduced', () => {
    const baseline = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    const reduced = waveformPreviewLayout(
      peaks,
      true,
      8,
      8 * PIXELS_PER_BEAT,
      40,
      8,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {clipGainDb: -6},
    );
    expect(firstPathVertexY(reduced.pathD)).toBeGreaterThan(firstPathVertexY(baseline.pathD));
  });

  it('expands waveform height when clip gain is boosted', () => {
    const baseline = waveformPreviewLayout(peaks, true, 8, 8 * PIXELS_PER_BEAT, 40, 8);
    const boosted = waveformPreviewLayout(
      peaks,
      true,
      8,
      8 * PIXELS_PER_BEAT,
      40,
      8,
      0,
      PIXELS_PER_BEAT,
      undefined,
      {clipGainDb: 6},
    );
    expect(firstPathVertexY(boosted.pathD)).toBeLessThan(firstPathVertexY(baseline.pathD));
  });
});

describe('buildBipolarEnvelopePath', () => {
  it('closes the smoothed envelope path', () => {
    const path = buildBipolarEnvelopePath([0.5, 1, 0.3], 100, 20, 36);
    expect(path.endsWith('Z')).toBe(true);
    expect(path).toContain(' Q ');
  });
});
