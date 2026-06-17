import {
  DEFAULT_PPQ,
  type MidiQuantizeMode,
} from '../music/midiClipNormalization';
import {clampNoteNumber, clampVelocity} from '../music/noteUtils';

export type PreserveMatrix = {
  rhythm: boolean;
  contour: boolean;
  exactNotes: boolean;
  emotionalTiming: boolean;
};

export type PreserveMatrixInput = Partial<PreserveMatrix>;

export type PreserveMidiNote = {
  pitch: number;
  start_tick: number;
  duration_ticks: number;
  velocity: number;
};

export type PreserveMatrixPayload = {
  matrix: PreserveMatrix;
  promptRules: {
    rhythm: string;
    contour: string;
    exactNotes: string;
    emotionalTiming: string;
  };
  postProcessing: {
    quantizeMode: MidiQuantizeMode;
    pitchPolicy: 'model' | 'source_contour' | 'source_exact';
    velocityPolicy: 'model' | 'source_dynamics' | 'flatten';
    ppq: number;
  };
};

/**
 * These defaults keep AI generation permissive until real UI toggles are wired:
 * model pitches/dynamics are accepted and timing is quantized. Callers opt into
 * stricter source locking per generation request.
 */
export const DEFAULT_PRESERVE_MATRIX: PreserveMatrix = {
  rhythm: false,
  contour: false,
  exactNotes: false,
  emotionalTiming: true,
};

function boolOrDefault(value: boolean | undefined, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function resolvePreserveMatrix(input?: PreserveMatrixInput): PreserveMatrix {
  return {
    rhythm: boolOrDefault(input?.rhythm, DEFAULT_PRESERVE_MATRIX.rhythm),
    contour: boolOrDefault(input?.contour, DEFAULT_PRESERVE_MATRIX.contour),
    exactNotes: boolOrDefault(input?.exactNotes, DEFAULT_PRESERVE_MATRIX.exactNotes),
    emotionalTiming: boolOrDefault(
      input?.emotionalTiming,
      DEFAULT_PRESERVE_MATRIX.emotionalTiming,
    ),
  };
}

export function preserveMatrixNormalizationContext(input?: PreserveMatrixInput): {
  quantizeMode: MidiQuantizeMode;
} {
  const matrix = resolvePreserveMatrix(input);
  return {quantizeMode: matrix.rhythm ? 'none' : 'classic'};
}

export function preserveMatrixPayload(input?: PreserveMatrixInput): PreserveMatrixPayload {
  const matrix = resolvePreserveMatrix(input);
  return {
    matrix,
    promptRules: {
      rhythm: matrix.rhythm ? 'lock_micro_timing_transients' : 'quantize_to_project_grid',
      contour: matrix.contour ? 'keep_melodic_shape' : 'allow_reharmonized_shape',
      exactNotes: matrix.exactNotes ? 'lock_source_pitches' : 'allow_scale_style_pitch_correction',
      emotionalTiming: matrix.emotionalTiming ? 'keep_velocity_phrasing' : 'flatten_velocity_phrasing',
    },
    postProcessing: {
      quantizeMode: matrix.rhythm ? 'none' : 'classic',
      pitchPolicy: matrix.exactNotes ? 'source_exact' : matrix.contour ? 'source_contour' : 'model',
      velocityPolicy: matrix.emotionalTiming ? 'source_dynamics' : 'flatten',
      ppq: DEFAULT_PPQ,
    },
  };
}

function sortMidiNotes<T extends PreserveMidiNote>(notes: T[]): T[] {
  return [...notes].sort((left, right) => {
    if (left.start_tick !== right.start_tick) {
      return left.start_tick - right.start_tick;
    }
    return left.pitch - right.pitch;
  });
}

function alignedSeed(
  index: number,
  candidateCount: number,
  seedNotes: PreserveMidiNote[],
): PreserveMidiNote | undefined {
  if (seedNotes.length === 0) {
    return undefined;
  }
  if (candidateCount <= 1 || seedNotes.length === 1) {
    return seedNotes[0];
  }
  const ratio = index / (candidateCount - 1);
  return seedNotes[Math.round(ratio * (seedNotes.length - 1))];
}

function flattenedVelocity(notes: PreserveMidiNote[]): number {
  if (notes.length === 0) {
    return 96;
  }
  const sum = notes.reduce((total, note) => total + note.velocity, 0);
  return clampVelocity(sum / notes.length);
}

function preservedPitch(
  candidate: PreserveMidiNote,
  seed: PreserveMidiNote | undefined,
  firstCandidate: PreserveMidiNote,
  firstSeed: PreserveMidiNote | undefined,
  matrix: PreserveMatrix,
): number {
  if (!seed) {
    return clampNoteNumber(candidate.pitch);
  }
  if (matrix.exactNotes) {
    return clampNoteNumber(seed.pitch);
  }
  if (matrix.contour && firstSeed) {
    return clampNoteNumber(firstCandidate.pitch + seed.pitch - firstSeed.pitch);
  }
  return clampNoteNumber(candidate.pitch);
}

export function applyPreserveMatrixToMidiNotes(
  candidateNotes: PreserveMidiNote[],
  seedNotes: PreserveMidiNote[] = [],
  input?: PreserveMatrixInput,
): PreserveMidiNote[] {
  if (candidateNotes.length === 0) {
    return [];
  }

  const matrix = resolvePreserveMatrix(input);
  const candidates = sortMidiNotes(candidateNotes);
  const seeds = sortMidiNotes(seedNotes);
  const firstCandidate = candidates[0];
  const firstSeed = seeds[0];
  const flatVelocity = flattenedVelocity(candidates);

  return candidates.map((candidate, index) => {
    const seed = alignedSeed(index, candidates.length, seeds);
    return {
      pitch: preservedPitch(candidate, seed, firstCandidate, firstSeed, matrix),
      start_tick: matrix.rhythm && seed ? Math.max(0, Math.round(seed.start_tick)) : candidate.start_tick,
      duration_ticks: matrix.rhythm && seed
        ? Math.max(1, Math.round(seed.duration_ticks))
        : candidate.duration_ticks,
      velocity: matrix.emotionalTiming
        ? clampVelocity(seed?.velocity ?? candidate.velocity)
        : flatVelocity,
    };
  });
}
