import {useCallback} from 'react';

import {sendNativeAudioCommandAsync} from '../native/NativeAudioEngine';
import {clampVelocity} from '../music/noteUtils';

type PreviewSampleArgs = {
  trackId: string;
  sampleKey: string;
  velocity?: number;
  /** Sixteenth step index for cell audition (0–15). */
  step?: number;
};

/** One-shot sample preview for drum machine lanes (bypasses midi_note_on). */
export function useSamplePreview() {
  const previewSample = useCallback(
    ({trackId, sampleKey, velocity = 100, step = 0}: PreviewSampleArgs) => {
      void sendNativeAudioCommandAsync('play_sample', {
        trackId,
        sampleKey,
        velocity: clampVelocity(velocity),
        step,
      });
    },
    [],
  );

  return {previewSample};
}
