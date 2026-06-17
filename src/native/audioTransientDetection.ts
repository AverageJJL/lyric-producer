import type {SamplerSliceIntent} from '../music/samplerSlicing';
import type {DAWBlock} from '../store/useDAWStore';
import {sendNativeAudioCommand} from './NativeAudioEngine';

export type NativeTransientSlice = {
  name: string;
  sourceStartSeconds: number;
  sourceLengthSeconds: number;
  sourceStartBeat: number;
  sourceLengthBeats: number;
  triggerNote: number;
  velocity: number;
  clipStartBeat?: number;
};

export type NativeTransientDetection = {
  absoluteAudioFilePath: string;
  durationSeconds: number;
  bpm: number;
  slices: NativeTransientSlice[];
};

export type DetectAudioTransientsOptions = {
  maxSlices?: number;
  threshold?: number;
  minGapSeconds?: number;
  minSliceSeconds?: number;
  maxSliceSeconds?: number;
};

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseSlice(value: unknown): NativeTransientSlice | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const item = value as Record<string, unknown>;
  if (
    typeof item.name !== 'string' ||
    !finite(item.sourceStartSeconds) ||
    !finite(item.sourceLengthSeconds) ||
    !finite(item.sourceStartBeat) ||
    !finite(item.sourceLengthBeats) ||
    !finite(item.triggerNote) ||
    !finite(item.velocity)
  ) {
    return null;
  }
  return {
    name: item.name,
    sourceStartSeconds: item.sourceStartSeconds,
    sourceLengthSeconds: item.sourceLengthSeconds,
    sourceStartBeat: item.sourceStartBeat,
    sourceLengthBeats: item.sourceLengthBeats,
    triggerNote: Math.round(item.triggerNote),
    velocity: Math.round(item.velocity),
    clipStartBeat: finite(item.clipStartBeat) ? item.clipStartBeat : undefined,
  };
}

export function parseTransientDetectionResponse(
  response: string | null,
): NativeTransientDetection | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    const data = parsed.ok === true ? parsed.data : null;
    if (
      !data ||
      typeof data.absoluteAudioFilePath !== 'string' ||
      !finite(data.durationSeconds) ||
      !finite(data.bpm) ||
      !Array.isArray(data.slices)
    ) {
      return null;
    }
    return {
      absoluteAudioFilePath: data.absoluteAudioFilePath,
      durationSeconds: data.durationSeconds,
      bpm: data.bpm,
      slices: data.slices.map(parseSlice).filter((item): item is NativeTransientSlice => item !== null),
    };
  } catch {
    return null;
  }
}

export function detectAudioTransients(
  absoluteAudioFilePath: string,
  options: DetectAudioTransientsOptions = {},
): NativeTransientDetection | null {
  return parseTransientDetectionResponse(sendNativeAudioCommand('detect_audio_transients', {
    absoluteAudioFilePath,
    ...options,
  }));
}

export function transientSlicesForAudioBlock(
  block: DAWBlock,
  detection: NativeTransientDetection,
): SamplerSliceIntent[] {
  const sourceOffset = block.sourceOffsetBeats ?? 0;
  const visibleLength = Math.max(0, block.lengthBeats);
  return detection.slices
    .map((slice, index): SamplerSliceIntent | null => {
      const clipLocalStart = slice.sourceStartBeat - sourceOffset;
      if (clipLocalStart < 0 || clipLocalStart >= visibleLength) {
        return null;
      }
      return {
        name: slice.name,
        sourceStartBeat: clipLocalStart,
        sourceLengthBeats: Math.min(slice.sourceLengthBeats, visibleLength - clipLocalStart),
        triggerNote: slice.triggerNote,
        velocity: slice.velocity,
        clipStartBeat: slice.clipStartBeat ?? index,
        clipLengthBeats: Math.min(slice.sourceLengthBeats, visibleLength - clipLocalStart),
      };
    })
    .filter((slice): slice is SamplerSliceIntent => slice !== null && slice.sourceLengthBeats > 0);
}
