/**
 * Transient timeline preview state — not in undo history or project snapshots.
 */

import {resamplePeaksMaxPool} from '../music/waveformPreviewLayout';
import type {DAWBlock, DAWNote} from './useDAWStore';

export type LiveMidiPreview = {
  trackId: string;
  /** Clip-local notes finalized during this preview session (e.g. while recording). */
  notes: DAWNote[];
  /** Held keys: MIDI note -> clip-local start beat + velocity. */
  active: Record<number, {startBeat: number; velocity: number}>;
  /** Block receiving overlay; null means ghost-at-playhead mode. */
  overlayBlockId: string | null;
  /** Timeline beat where ghost preview anchors when no overlay block. */
  ghostAnchorBeat: number;
};

export type LiveAudioPreview = {
  trackId: string;
  clipId: string;
  peaks: number[];
};

/** Live recording peak buffer — downsampled in place when exceeded (not tail-sliced). */
export const LIVE_AUDIO_PEAK_CAP = 4096;
const MIN_NOTE_LENGTH_BEATS = 0.05;
const AUDITION_MIN_LENGTH_BEATS = 0.25;

export function emptyLiveMidiPreview(
  trackId: string,
  overlayBlockId: string | null,
  ghostAnchorBeat: number,
): LiveMidiPreview {
  return {trackId, notes: [], active: {}, overlayBlockId, ghostAnchorBeat};
}

export function findMidiOverlayBlock(
  blocks: DAWBlock[],
  trackId: string,
  recordingBlockId: string | null,
  selectedBlockId: string | null,
): DAWBlock | null {
  if (recordingBlockId) {
    const recording = blocks.find(
      block => block.id === recordingBlockId && block.trackId === trackId && block.type === 'midi',
    );
    if (recording) {
      return recording;
    }
  }

  if (selectedBlockId) {
    const selected = blocks.find(
      block => block.id === selectedBlockId && block.trackId === trackId && block.type === 'midi',
    );
    if (selected) {
      return selected;
    }
  }

  return blocks.find(block => block.trackId === trackId && block.type === 'midi') ?? null;
}

export function clipLocalBeat(playheadBeat: number, blockStartBeat: number): number {
  return Math.max(0, playheadBeat - blockStartBeat);
}

/** Active held notes as clip-local DAWNote[] for rendering. */
export function activeNotesAsClipLocal(
  preview: LiveMidiPreview,
  playheadBeat: number,
  blockStartBeat: number,
): DAWNote[] {
  return Object.entries(preview.active).map(([pitch, held]) => {
    const note = Number(pitch);
    const endLocal = clipLocalBeat(playheadBeat, blockStartBeat);
    const lengthBeats = Math.max(MIN_NOTE_LENGTH_BEATS, endLocal - held.startBeat);
    return {note, velocity: held.velocity, startBeat: held.startBeat, lengthBeats};
  });
}

export function shouldShowGhostMidiPreview(
  preview: LiveMidiPreview | undefined,
  trackId: string,
  isRecording: boolean,
): boolean {
  if (!isRecording || !preview || preview.trackId !== trackId) {
    return false;
  }
  if (preview.overlayBlockId) {
    return false;
  }
  const hasActive = Object.keys(preview.active).length > 0;
  const hasNotes = preview.notes.length > 0;
  return hasActive || hasNotes;
}

export function buildGhostMidiBlock(
  preview: LiveMidiPreview,
  trackId: string,
  color: string,
  playheadBeat: number,
): DAWBlock {
  const startBeat = preview.ghostAnchorBeat;
  const lengthBeats = Math.max(AUDITION_MIN_LENGTH_BEATS, playheadBeat - startBeat + 0.5);
  const notes = [
    ...preview.notes,
    ...activeNotesAsClipLocal(preview, playheadBeat, startBeat),
  ];
  return {
    id: `ghost-midi-${trackId}`,
    trackId,
    name: 'Input',
    startBeat,
    lengthBeats,
    type: 'midi',
    color,
    notes,
  };
}

export function appendLiveAudioPeaks(existing: number[], incoming: number[]): number[] {
  const merged = [...existing, ...incoming.map(p => Math.min(1, Math.max(0, p)))];
  if (merged.length <= LIVE_AUDIO_PEAK_CAP) {
    return merged;
  }
  return resamplePeaksMaxPool(merged, LIVE_AUDIO_PEAK_CAP);
}
