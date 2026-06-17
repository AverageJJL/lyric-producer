import {
  captureProjectSnapshot,
  snapshotFingerprint,
  type ProjectSnapshot,
} from '../arrangement/projectSnapshot';
import {
  constraintLockContextFromSnapshot,
  type ConstraintLockContext,
} from './constraintLocks';
import {
  projectPerformanceContext,
  type ProjectPerformanceContext,
} from '../transport/performanceMode';
import type {ArrangementValidationError} from './schemaValidation';

export const AI_PRODUCER_SYSTEM_PROMPT = [
  'You are AI Producer Core, an orchestration model for a DAW.',
  'Use the project snapshot, media references, and user instruction as the only execution context.',
  'Return strict JSON shaped as {"operations":[...]} with operations matching the validated ArrangementOperation schema.',
  'Do not return markdown, prose outside JSON, file writes, raw audio, or unvalidated commands.',
  'Treat the project BPM, time signature, grid, locks, and existing track IDs as source of truth.',
  'Use project.performance.mode to distinguish linear arrangement edits from circular looper edits.',
  'Never mutate assets listed in project.constraintLocks non-mutable context.',
].join(' ');

export type AiHandoffWavAttachment = {
  path: string;
  clipId?: string;
  trackId?: string;
  name?: string;
  source: 'project_audio' | 'user_capture' | 'reference_bounce';
};

export type AiHandoffSpectrogramAttachment = {
  path: string;
  clipId?: string;
  trackId?: string;
  sourceWavPath?: string;
};

export type AiProducerHandoffPayload = {
  schemaVersion: 1;
  createdAt: string;
  systemPrompt: string;
  userInstruction: string;
  temperature: number;
  project: {
    snapshot: ProjectSnapshot;
    snapshotFingerprint: string;
    constraintLocks: ConstraintLockContext;
    performance: ProjectPerformanceContext;
  };
  media: {
    wav: AiHandoffWavAttachment[];
    spectrogramPng: AiHandoffSpectrogramAttachment[];
  };
};

export type AiProducerHandoffInput = {
  userInstruction: string;
  temperature?: number;
  snapshot?: ProjectSnapshot;
  createdAt?: string;
  systemPrompt?: string;
  wavAttachments?: AiHandoffWavAttachment[];
  spectrogramAttachments?: AiHandoffSpectrogramAttachment[];
};

export type AiProducerHandoffResult =
  | {ok: true; payload: AiProducerHandoffPayload}
  | {ok: false; errors: ArrangementValidationError[]};

function extension(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot).toLowerCase() : '';
}

function pathError(
  errors: ArrangementValidationError[],
  path: string,
  message: string,
): void {
  errors.push({path, message});
}

function validateTemperature(value: number | undefined, errors: ArrangementValidationError[]): number {
  const temperature = value ?? 0.5;
  if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
    pathError(errors, 'temperature', 'Expected a finite temperature from 0 to 2.');
    return 0.5;
  }
  return temperature;
}

function audioPathForBlock(block: ProjectSnapshot['blocks'][number]): string | null {
  return block.absoluteAudioFilePath ?? block.audioFilePath ?? null;
}

export function mediaAttachmentsFromSnapshot(snapshot: ProjectSnapshot): {
  wav: AiHandoffWavAttachment[];
  spectrogramPng: AiHandoffSpectrogramAttachment[];
} {
  const wav: AiHandoffWavAttachment[] = [];
  const spectrogramPng: AiHandoffSpectrogramAttachment[] = [];

  snapshot.blocks.forEach(block => {
    if (block.type !== 'audio') {
      return;
    }
    const sourceWavPath = audioPathForBlock(block);
    if (sourceWavPath) {
      wav.push({
        path: sourceWavPath,
        clipId: block.id,
        trackId: block.trackId,
        name: block.name,
        source: 'project_audio',
      });
    }
    if (block.spectrogramPngPath) {
      spectrogramPng.push({
        path: block.spectrogramPngPath,
        clipId: block.id,
        trackId: block.trackId,
        sourceWavPath: sourceWavPath ?? undefined,
      });
    }
  });

  return {wav, spectrogramPng};
}

function uniqueByPath<T extends {path: string}>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    if (seen.has(item.path)) {
      return false;
    }
    seen.add(item.path);
    return true;
  });
}

function validateWavAttachments(
  wav: AiHandoffWavAttachment[],
  errors: ArrangementValidationError[],
): void {
  wav.forEach((attachment, index) => {
    if (!attachment.path || extension(attachment.path) !== '.wav') {
      pathError(errors, `media.wav[${index}].path`, 'Expected a .wav path reference.');
    }
  });
}

function validateSpectrogramAttachments(
  spectrograms: AiHandoffSpectrogramAttachment[],
  errors: ArrangementValidationError[],
): void {
  spectrograms.forEach((attachment, index) => {
    if (!attachment.path || extension(attachment.path) !== '.png') {
      pathError(errors, `media.spectrogramPng[${index}].path`, 'Expected a .png path reference.');
    }
  });
}

export function buildAiProducerHandoffPayload(
  input: AiProducerHandoffInput,
): AiProducerHandoffResult {
  const errors: ArrangementValidationError[] = [];
  const userInstruction = input.userInstruction.trim();
  if (userInstruction.length === 0) {
    pathError(errors, 'userInstruction', 'Expected non-empty user instruction text.');
  }

  const snapshot = input.snapshot ?? captureProjectSnapshot();
  const fromSnapshot = mediaAttachmentsFromSnapshot(snapshot);
  const wav = uniqueByPath([...fromSnapshot.wav, ...(input.wavAttachments ?? [])]);
  const spectrogramPng = uniqueByPath([
    ...fromSnapshot.spectrogramPng,
    ...(input.spectrogramAttachments ?? []),
  ]);
  validateWavAttachments(wav, errors);
  validateSpectrogramAttachments(spectrogramPng, errors);

  const temperature = validateTemperature(input.temperature, errors);
  if (errors.length > 0) {
    return {ok: false, errors};
  }

  return {
    ok: true,
    payload: {
      schemaVersion: 1,
      createdAt: input.createdAt ?? new Date().toISOString(),
      systemPrompt: input.systemPrompt ?? AI_PRODUCER_SYSTEM_PROMPT,
      userInstruction,
      temperature,
      project: {
        snapshot,
        snapshotFingerprint: snapshotFingerprint(snapshot),
        constraintLocks: constraintLockContextFromSnapshot(snapshot),
        performance: projectPerformanceContext(snapshot),
      },
      media: {wav, spectrogramPng},
    },
  };
}
