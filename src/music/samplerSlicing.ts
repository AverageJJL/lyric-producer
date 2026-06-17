import type {DAWBlock, DAWNote} from '../store/useDAWStore';
import {
  SAMPLER_SLICES_INSTRUMENT_ID,
  SAMPLER_SLICES_PRESET_ID,
  type SampleInstrumentRegion,
} from './sampleInstruments';

export {SAMPLER_SLICES_INSTRUMENT_ID, SAMPLER_SLICES_PRESET_ID};

export type SamplerSliceIntent = {
  id?: string;
  name?: string;
  sourceStartBeat: number;
  sourceLengthBeats: number;
  triggerNote?: number;
  velocity?: number;
  clipStartBeat?: number;
  clipLengthBeats?: number;
  gainDb?: number;
};

export type SamplerSliceBuild = {
  regions: SampleInstrumentRegion[];
  notes: DAWNote[];
};

const DEFAULT_TRIGGER_NOTE = 48;
const MIN_SLICE_BEATS = 0.000001;

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function triggerNoteForSlice(slice: SamplerSliceIntent, index: number): number {
  return finite(slice.triggerNote)
    ? clamp(Math.round(slice.triggerNote), 0, 127)
    : clamp(DEFAULT_TRIGGER_NOTE + index, 0, 127);
}

function velocityForSlice(slice: SamplerSliceIntent): number {
  return finite(slice.velocity)
    ? clamp(Math.round(slice.velocity), 1, 127)
    : 100;
}

function secondsPerBeat(block: DAWBlock, bpm: number): number {
  const sourceLength = block.sourceLengthBeats ?? block.lengthBeats;
  return finite(block.durationSeconds) && block.durationSeconds > 0 && sourceLength > 0
    ? block.durationSeconds / sourceLength
    : 60 / Math.max(1, bpm);
}

function boundedSlice(slice: SamplerSliceIntent, block: DAWBlock) {
  if (!finite(slice.sourceStartBeat) || !finite(slice.sourceLengthBeats)) {
    return null;
  }
  const visibleLength = Math.max(MIN_SLICE_BEATS, block.lengthBeats);
  const startInClip = clamp(slice.sourceStartBeat, 0, visibleLength - MIN_SLICE_BEATS);
  const maxLength = Math.max(MIN_SLICE_BEATS, visibleLength - startInClip);
  const sourceLength = clamp(slice.sourceLengthBeats, MIN_SLICE_BEATS, maxLength);
  return {startInClip, sourceLength};
}

export function buildSamplerSlicesFromAudioBlock(
  block: DAWBlock,
  bpm: number,
  slices: SamplerSliceIntent[],
): SamplerSliceBuild | null {
  const relativePath = block.audioFilePath;
  if (block.type !== 'audio' || !relativePath || slices.length === 0) {
    return null;
  }

  const spb = secondsPerBeat(block, bpm);
  const sourceOffset = block.sourceOffsetBeats ?? 0;
  const regions: SampleInstrumentRegion[] = [];
  const notes: DAWNote[] = [];

  slices.forEach((slice, index) => {
    const bounded = boundedSlice(slice, block);
    if (!bounded) {
      return;
    }
    const triggerNote = triggerNoteForSlice(slice, index);
    const sourceStartBeat = sourceOffset + bounded.startInClip;
    const sourceEndBeat = sourceStartBeat + bounded.sourceLength;
    regions.push({
      name: slice.name?.trim() || `Slice ${index + 1}`,
      relativePath,
      rootNote: triggerNote,
      minNote: triggerNote,
      maxNote: triggerNote,
      gainDb: finite(slice.gainDb) ? slice.gainDb : 0,
      sourceStartSeconds: sourceStartBeat * spb,
      sourceEndSeconds: sourceEndBeat * spb,
    });
    notes.push({
      note: triggerNote,
      velocity: velocityForSlice(slice),
      startBeat: finite(slice.clipStartBeat) ? Math.max(0, slice.clipStartBeat) : index,
      lengthBeats: finite(slice.clipLengthBeats)
        ? Math.max(MIN_SLICE_BEATS, slice.clipLengthBeats)
        : bounded.sourceLength,
    });
  });

  return regions.length > 0 ? {regions, notes} : null;
}
