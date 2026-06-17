import {
  DEFAULT_PPQ,
  type RawMidiNoteInput,
} from '../music/midiClipNormalization';
import {clampNoteNumber, clampVelocity} from '../music/noteUtils';

export const DEFAULT_MIN_USABLE_AI_PITCH = 24;

export type AiTickMidiNote = {
  pitch: number;
  start_tick: number;
  duration_ticks: number;
  velocity: number;
};

export type AiNormalizationGuardrailOptions = {
  projectBpm: number;
  ppq?: number;
  minUsablePitch?: number;
};

export type AiNormalizationGuardrailReport = {
  ppq: number;
  projectBpm: number;
  timingSource: 'project_bpm_ticks';
  octaveAdjustedCount: number;
};

export type AiNormalizationGuardrailResult = {
  notes: RawMidiNoteInput[];
  report: AiNormalizationGuardrailReport;
};

function safePpq(ppq: number | undefined): number {
  return Number.isInteger(ppq) && ppq > 0 ? ppq : DEFAULT_PPQ;
}

function safeBpm(bpm: number): number {
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 120;
}

export function octaveSafeAiPitch(
  pitch: number,
  minUsablePitch = DEFAULT_MIN_USABLE_AI_PITCH,
): number {
  let next = Math.round(pitch);
  let shifts = 0;
  while (next < minUsablePitch && shifts < 2) {
    next += 12;
    shifts += 1;
  }
  return clampNoteNumber(Math.max(next, minUsablePitch));
}

function ticksToBeats(ticks: number, projectBpm: number, ppq: number): number {
  const secondsPerBeat = 60 / safeBpm(projectBpm);
  const seconds = (Math.max(0, ticks) * secondsPerBeat) / ppq;
  return seconds / secondsPerBeat;
}

export function applyAiNormalizationGuardrails(
  notes: AiTickMidiNote[],
  options: AiNormalizationGuardrailOptions,
): AiNormalizationGuardrailResult {
  const ppq = safePpq(options.ppq);
  const projectBpm = safeBpm(options.projectBpm);
  const minUsablePitch = options.minUsablePitch ?? DEFAULT_MIN_USABLE_AI_PITCH;
  let octaveAdjustedCount = 0;

  const guarded = notes.map(note => {
    const pitch = octaveSafeAiPitch(note.pitch, minUsablePitch);
    if (pitch !== clampNoteNumber(note.pitch)) {
      octaveAdjustedCount += 1;
    }
    return {
      note: pitch,
      velocity: clampVelocity(note.velocity),
      startBeat: ticksToBeats(note.start_tick, projectBpm, ppq),
      lengthBeats: Math.max(1 / ppq, ticksToBeats(note.duration_ticks, projectBpm, ppq)),
    };
  });

  return {
    notes: guarded,
    report: {
      ppq,
      projectBpm,
      timingSource: 'project_bpm_ticks',
      octaveAdjustedCount,
    },
  };
}
