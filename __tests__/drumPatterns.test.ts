import {
  BEATS_PER_BAR,
  BEATS_PER_STEP,
  barCountForLength,
  createEmptyPattern,
  normalizeDrumPattern,
  patternActiveSteps,
  patternStepsPayload,
  snapLengthToSteps,
  STEPS_PER_BAR,
  toggleStep,
} from '../src/music/drumPatterns';

describe('drumPatterns', () => {
  it('creates an empty 16-step row per lane', () => {
    const pattern = createEmptyPattern('Pattern A', 'pat-a');
    expect(pattern.name).toBe('Pattern A');
    expect(pattern.steps.kick).toHaveLength(STEPS_PER_BAR);
    expect(pattern.steps.kick.every(active => !active)).toBe(true);
  });

  it('normalizes legacy patterns missing newer lanes', () => {
    const legacy = {
      id: 'old',
      name: 'Legacy',
      steps: {
        kick: Array.from({length: STEPS_PER_BAR}, (_, i) => i === 0),
        snare: Array.from({length: STEPS_PER_BAR}, () => false),
      },
    } as ReturnType<typeof createEmptyPattern>;

    const normalized = normalizeDrumPattern(legacy);
    expect(normalized.steps.kick[0]).toBe(true);
    expect(normalized.steps.perc).toHaveLength(STEPS_PER_BAR);
    expect(normalized.steps.perc.every(active => !active)).toBe(true);
    expect(toggleStep(legacy, 'perc', 2).steps.perc[2]).toBe(true);
  });

  it('toggles steps on and off', () => {
    const empty = createEmptyPattern('Pattern A', 'pat-a');
    const on = toggleStep(empty, 'kick', 0);
    expect(on.steps.kick[0]).toBe(true);
    const off = toggleStep(on, 'kick', 0);
    expect(off.steps.kick[0]).toBe(false);
  });

  it('exports active steps for engine lanes payload', () => {
    let pattern = createEmptyPattern('Pattern A', 'pat-a');
    pattern = toggleStep(pattern, 'kick', 0);
    pattern = toggleStep(pattern, 'snare', 4);
    expect(patternActiveSteps(pattern, 'kick')).toEqual([0]);
    expect(patternStepsPayload(pattern)).toEqual({kick: [0], snare: [4]});
  });

  it('snaps block length to sixteenth steps', () => {
    expect(snapLengthToSteps(4)).toBe(4);
    expect(snapLengthToSteps(4.3)).toBe(4.25);
    expect(snapLengthToSteps(0.1)).toBe(BEATS_PER_STEP);
  });

  it('computes bar count for loop rendering', () => {
    expect(barCountForLength(BEATS_PER_BAR)).toBe(1);
    expect(barCountForLength(BEATS_PER_BAR * 2)).toBe(2);
    expect(barCountForLength(BEATS_PER_BAR + BEATS_PER_STEP)).toBe(2);
  });
});
