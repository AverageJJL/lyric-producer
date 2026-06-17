import {
  applyPreserveMatrixToMidiNotes,
  preserveMatrixNormalizationContext,
  preserveMatrixPayload,
} from '../src/orchestration/preserveMatrix';

describe('preserve matrix policy', () => {
  it('turns toggles into LLM-facing rules and normalization policy', () => {
    const payload = preserveMatrixPayload({
      rhythm: true,
      contour: true,
      exactNotes: false,
      emotionalTiming: false,
    });

    expect(payload).toEqual({
      matrix: {
        rhythm: true,
        contour: true,
        exactNotes: false,
        emotionalTiming: false,
      },
      promptRules: {
        rhythm: 'lock_micro_timing_transients',
        contour: 'keep_melodic_shape',
        exactNotes: 'allow_scale_style_pitch_correction',
        emotionalTiming: 'flatten_velocity_phrasing',
      },
      postProcessing: {
        quantizeMode: 'none',
        pitchPolicy: 'source_contour',
        velocityPolicy: 'flatten',
        ppq: 480,
      },
    });
    expect(preserveMatrixNormalizationContext({rhythm: true})).toEqual({
      quantizeMode: 'none',
    });
  });

  it('can lock source rhythm and exact notes while flattening dynamics', () => {
    const result = applyPreserveMatrixToMidiNotes(
      [
        {pitch: 67, start_tick: 43, duration_ticks: 180, velocity: 20},
        {pitch: 71, start_tick: 730, duration_ticks: 200, velocity: 100},
      ],
      [
        {pitch: 60, start_tick: 24, duration_ticks: 456, velocity: 80},
        {pitch: 64, start_tick: 720, duration_ticks: 240, velocity: 110},
      ],
      {
        rhythm: true,
        exactNotes: true,
        emotionalTiming: false,
      },
    );

    expect(result).toEqual([
      {pitch: 60, start_tick: 24, duration_ticks: 456, velocity: 60},
      {pitch: 64, start_tick: 720, duration_ticks: 240, velocity: 60},
    ]);
  });
});
