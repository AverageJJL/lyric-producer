import {useCallback, useRef} from 'react';

import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {clampNoteNumber, clampVelocity} from '../music/noteUtils';
import {useDAWStore} from '../store/useDAWStore';

type PreviewNoteArgs = {
  trackId: string;
  note: number;
  velocity?: number;
};

/** Live keyboard preview bypasses clip upsert for low-latency note audition. */
export function useKeyboardPreview() {
  const activeNotesRef = useRef<Set<number>>(new Set());

  const previewNoteOn = useCallback(({trackId, note, velocity = 100}: PreviewNoteArgs) => {
    const clampedNote = clampNoteNumber(note);
    const store = useDAWStore.getState();
    activeNotesRef.current.add(clampedNote);
    store.setMidiAudition({trackId, source: 'keyboard'});
    store.beginLiveMidiNote(trackId, clampedNote, clampVelocity(velocity), store.playheadBeat);
    sendNativeAudioCommand('midi_note_on', {
      trackId,
      note: clampedNote,
      velocity: clampVelocity(velocity),
      channel: 0,
      source: 'ui_keyboard',
    });
  }, []);

  const previewNoteOff = useCallback(({trackId, note}: PreviewNoteArgs) => {
    const clampedNote = clampNoteNumber(note);
    const store = useDAWStore.getState();
    activeNotesRef.current.delete(clampedNote);
    store.endLiveMidiNote(trackId, clampedNote, store.playheadBeat);
    sendNativeAudioCommand('midi_note_off', {
      trackId,
      note: clampedNote,
      channel: 0,
      source: 'ui_keyboard',
    });
    if (activeNotesRef.current.size === 0) {
      store.clearMidiAudition();
      if (!store.isRecording) {
        store.clearLiveMidiPreview(trackId);
      }
    }
  }, []);

  const panicAllNotesOff = useCallback((trackId?: string) => {
    activeNotesRef.current.clear();
    const store = useDAWStore.getState();
    store.clearMidiAudition();
    if (trackId) {
      store.clearLiveMidiPreview(trackId);
    } else {
      store.clearLiveMidiPreview();
    }
    sendNativeAudioCommand('midi_all_notes_off', trackId ? {trackId} : {});
  }, []);

  return {
    previewNoteOn,
    previewNoteOff,
    panicAllNotesOff,
  };
}
