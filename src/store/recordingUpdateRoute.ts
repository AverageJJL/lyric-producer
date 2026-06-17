/**
 * Routes native onRecordingUpdate payloads into store actions (testable without React).
 */

import type {DAWStore} from './useDAWStore';

export type RecordingUpdatePayload = {
  event?: string;
  trackId?: string;
  clipId?: string;
  notes?: Array<{note: number; velocity: number; startBeat: number; lengthBeats: number}>;
  audioFilePath?: string;
  lengthBeats?: number;
  waveformPeaks?: number[];
  peaks?: number[];
  isRecording?: boolean;
};

export function applyRecordingUpdatePayload(
  payload: RecordingUpdatePayload,
  store: Pick<
    DAWStore,
    | 'appendLiveAudioPeaks'
    | 'setIsRecording'
    | 'clearLiveAudioPreview'
    | 'finalizeRecordingSession'
    | 'recordingBlockId'
  >,
): void {
  if (payload.event === 'audioInputPeaks' && payload.clipId && payload.trackId) {
    const peaks = payload.peaks ?? payload.waveformPeaks ?? [];
    store.appendLiveAudioPeaks(payload.trackId, payload.clipId, peaks);
    return;
  }

  if (payload.isRecording === true) {
    store.setIsRecording(true);
  }

  if (payload.isRecording === false) {
    store.setIsRecording(false);
    if (payload.audioFilePath) {
      if (payload.clipId) {
        store.clearLiveAudioPreview(payload.clipId);
      }
      return;
    }

    if (payload.clipId && store.recordingBlockId) {
      store.finalizeRecordingSession(payload.notes ?? []);
    }
  }
}
