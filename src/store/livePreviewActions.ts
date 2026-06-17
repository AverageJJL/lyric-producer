/**
 * Live preview action implementations — wired into useDAWStore.
 */

import {
  appendLiveAudioPeaks,
  clipLocalBeat,
  emptyLiveMidiPreview,
  findMidiOverlayBlock,
} from './livePreview';
import type {LiveAudioPreview, LiveMidiPreview} from './livePreview';
import type {DAWStore} from './useDAWStore';

const MIN_NOTE_LENGTH_BEATS = 0.05;

type SetState = (
  partial: Partial<DAWStore> | ((state: DAWStore) => Partial<DAWStore>),
) => void;
type GetState = () => DAWStore;

function ensureMidiPreview(
  state: DAWStore,
  trackId: string,
): {next: Record<string, LiveMidiPreview>; preview: LiveMidiPreview} {
  const existing = state.liveMidiPreviewByTrack[trackId];
  if (existing) {
    return {next: state.liveMidiPreviewByTrack, preview: existing};
  }
  const overlay = findMidiOverlayBlock(
    state.blocks,
    trackId,
    state.recordingBlockId,
    state.selectedBlockId,
  );
  const preview = emptyLiveMidiPreview(
    trackId,
    overlay?.id ?? null,
    state.playheadBeat,
  );
  return {
    next: {...state.liveMidiPreviewByTrack, [trackId]: preview},
    preview,
  };
}

export function createLivePreviewActions(get: GetState, set: SetState) {
  return {
    beginLiveMidiNote: (trackId: string, note: number, velocity: number, playheadBeat: number) => {
      set(state => {
        const {next, preview} = ensureMidiPreview(state, trackId);
        const overlay = findMidiOverlayBlock(
          state.blocks,
          trackId,
          state.recordingBlockId,
          state.selectedBlockId,
        );
        const blockStart = overlay?.startBeat ?? playheadBeat;
        const updated: LiveMidiPreview = {
          ...preview,
          overlayBlockId: overlay?.id ?? null,
          ghostAnchorBeat: overlay ? blockStart : playheadBeat,
          active: {
            ...preview.active,
            [note]: {startBeat: clipLocalBeat(playheadBeat, blockStart), velocity},
          },
        };
        return {
          liveMidiPreviewByTrack: {...next, [trackId]: updated},
          syncSource: 'ui' as const,
        };
      });
    },

    endLiveMidiNote: (trackId: string, note: number, playheadBeat: number) => {
      set(state => {
        const preview = state.liveMidiPreviewByTrack[trackId];
        if (!preview || preview.active[note] === undefined) {
          return state;
        }
        const held = preview.active[note]!;
        const overlay = findMidiOverlayBlock(
          state.blocks,
          trackId,
          state.recordingBlockId,
          state.selectedBlockId,
        );
        const blockStart = overlay?.startBeat ?? preview.ghostAnchorBeat;
        const endLocal = clipLocalBeat(playheadBeat, blockStart);
        const lengthBeats = Math.max(MIN_NOTE_LENGTH_BEATS, endLocal - held.startBeat);

        const remainingActive = {...preview.active};
        delete remainingActive[note];
        const recordingMidi =
          state.isRecording &&
          state.recordingBlockId &&
          state.blocks.find(
            b => b.id === state.recordingBlockId && b.trackId === trackId && b.type === 'midi',
          );

        const nextNote = {
          note,
          velocity: held.velocity,
          startBeat: held.startBeat,
          lengthBeats,
        };

        const nextPreview: LiveMidiPreview = {
          ...preview,
          active: remainingActive,
          notes: recordingMidi ? [...preview.notes, nextNote] : preview.notes,
        };

        const nextByTrack = {...state.liveMidiPreviewByTrack, [trackId]: nextPreview};
        if (
          !recordingMidi &&
          Object.keys(remainingActive).length === 0 &&
          nextPreview.notes.length === 0
        ) {
          delete nextByTrack[trackId];
        }

        return {liveMidiPreviewByTrack: nextByTrack, syncSource: 'ui' as const};
      });
    },

    tickLiveMidiPreview: (playheadBeat: number) => {
      set(state => {
        const keys = Object.keys(state.liveMidiPreviewByTrack);
        if (keys.length === 0) {
          return state;
        }
        let changed = false;
        const nextByTrack = {...state.liveMidiPreviewByTrack};
        for (const trackId of keys) {
          const preview = nextByTrack[trackId];
          if (!preview || Object.keys(preview.active).length === 0) {
            continue;
          }
          changed = true;
          nextByTrack[trackId] = {...preview, ghostAnchorBeat: preview.ghostAnchorBeat};
          void playheadBeat;
        }
        return changed ? {liveMidiPreviewByTrack: nextByTrack, syncSource: 'ui' as const} : state;
      });
    },

    clearLiveMidiPreview: (trackId?: string) => {
      set(state => {
        if (!trackId) {
          return {liveMidiPreviewByTrack: {}, syncSource: 'ui' as const};
        }
        const next = {...state.liveMidiPreviewByTrack};
        delete next[trackId];
        return {liveMidiPreviewByTrack: next, syncSource: 'ui' as const};
      });
    },

    appendLiveAudioPeaks: (trackId: string, clipId: string, peaks: number[]) => {
      if (peaks.length === 0) {
        return;
      }
      set(state => {
        const existing = state.liveAudioPreviewByClip[clipId];
        const merged = appendLiveAudioPeaks(existing?.peaks ?? [], peaks);
        const nextEntry: LiveAudioPreview = {trackId, clipId, peaks: merged};
        return {
          liveAudioPreviewByClip: {...state.liveAudioPreviewByClip, [clipId]: nextEntry},
          syncSource: 'ui' as const,
        };
      });
    },

    clearLiveAudioPreview: (clipId?: string) => {
      set(state => {
        if (!clipId) {
          return {liveAudioPreviewByClip: {}, syncSource: 'ui' as const};
        }
        const next = {...state.liveAudioPreviewByClip};
        delete next[clipId];
        return {liveAudioPreviewByClip: next, syncSource: 'ui' as const};
      });
    },
  };
}
