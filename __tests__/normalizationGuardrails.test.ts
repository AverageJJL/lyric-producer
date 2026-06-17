import {
  applyAiNormalizationGuardrails,
  octaveSafeAiPitch,
} from '../src/orchestration/normalizationGuardrails';

describe('AI normalization guardrails', () => {
  it('raises generated notes below the usable octave range', () => {
    expect(octaveSafeAiPitch(12)).toBe(24);
    expect(octaveSafeAiPitch(23)).toBe(35);
    expect(octaveSafeAiPitch(40)).toBe(40);
  });

  it('recomputes beats from ticks through the project BPM policy', () => {
    const notesWithStrayBeatFields = [
      {
        pitch: 12,
        start_tick: 960,
        duration_ticks: 240,
        velocity: 180,
        startBeat: 99,
        lengthBeats: 99,
      },
    ];
    const result = applyAiNormalizationGuardrails(notesWithStrayBeatFields, {
      projectBpm: 90,
      ppq: 480,
    });

    expect(result.notes).toEqual([
      {note: 24, velocity: 127, startBeat: 2, lengthBeats: 0.5},
    ]);
    expect(result.report).toEqual({
      ppq: 480,
      projectBpm: 90,
      timingSource: 'project_bpm_ticks',
      octaveAdjustedCount: 1,
    });
  });

  it('falls back to standard PPQ and safe positive lengths', () => {
    const result = applyAiNormalizationGuardrails([
      {pitch: 64, start_tick: 480, duration_ticks: 0, velocity: 80},
    ], {
      projectBpm: 0,
      ppq: 0,
    });

    expect(result.notes[0]).toMatchObject({
      note: 64,
      startBeat: 1,
      lengthBeats: 1 / 480,
    });
    expect(result.report).toMatchObject({ppq: 480, projectBpm: 120});
  });
});
