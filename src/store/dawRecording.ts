import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {buildNativeTransportPayload} from '../native/transportPayload';
import {
  refreshPlaybackOutputAfterVoice,
  resyncEngineAfterVoiceRecording,
  syncAllBlocksToEngine,
} from '../native/refreshPlayback';
import {tempoMapSecondsAtBeat} from '../transport/tempoMapTiming';
import {isAutoRecordingLatencyCompensationMs} from '../transport/recordingPreferences';
import type {RecordingFinalizePayload} from './useDAWStore';
import {useDAWStore} from './useDAWStore';

/** While true, useDAWNativeBridge skips transport + block upserts during voice-stop heal. */
export let suppressNativeBridgeSync = false;

export function runWithNativeBridgeSyncSuppressed<T>(fn: () => T): T {
  const previous = suppressNativeBridgeSync;
  suppressNativeBridgeSync = true;
  try {
    return fn();
  } finally {
    suppressNativeBridgeSync = previous;
  }
}

/** Toggle play/pause from transport UI or global shortcuts (e.g. Space). */
export function toggleTransportPlayback(): void {
  const state = useDAWStore.getState();
  if (state.isRecording && state.isPlaying) {
    stopActiveRecordingSession();
    return;
  }
  state.setIsPlaying(!state.isPlaying);
}

/** Stop the active record session (voice or MIDI) and reset transport to the clip end. */
export function stopActiveRecordingSession(): void {
  const state = useDAWStore.getState();
  if (!state.isRecording) {
    return;
  }

  const activeClipId = state.recordingBlockId;
  const recordingBlock = activeClipId
    ? state.blocks.find(block => block.id === activeClipId)
    : null;
  const recordTrack = recordingBlock
    ? state.tracks.find(track => track.id === recordingBlock.trackId) ?? null
    : null;
  if (!recordTrack) {
    state.finalizeRecordingSession({});
    pauseTransportAtPlayhead();
    return;
  }

  const isVoiceCapture = recordTrack.type === 'voice_audio';
  const isDrumCapture = recordTrack.type === 'drum_machine';
  const nativeLatency = isAutoRecordingLatencyCompensationMs(
    state.recordingLatencyCompensationMs,
  ) ? readNativeRecordingLatencySnapshot() : undefined;

  if (isDrumCapture) {
    state.finalizeRecordingSession({});
    pauseTransportAtClipEnd(activeClipId);
    return;
  }

  const commandName = isVoiceCapture ? 'stop_audio_recording' : 'stop_recording';
  const response = sendNativeAudioCommand(commandName, {
    trackId: recordTrack.id,
    clipId: activeClipId,
  });

  const completeStop = () => {
    if (!isVoiceCapture) {
      pauseTransportAtClipEnd(activeClipId);
    }
  };

  if (!response) {
    if (isVoiceCapture) {
      healEngineAfterVoiceStop(activeClipId, withNativeRecordingLatency({}, nativeLatency));
    } else {
      state.finalizeRecordingSession([]);
      completeStop();
    }
    return;
  }

  try {
    const parsed = JSON.parse(response) as {
      ok?: boolean;
      data?: RecordingFinalizePayload;
    };

    if (!parsed.ok || !parsed.data) {
      if (isVoiceCapture) {
        healEngineAfterVoiceStop(activeClipId, withNativeRecordingLatency({}, nativeLatency));
      } else {
        state.finalizeRecordingSession([]);
        completeStop();
      }
      return;
    }

    if (isVoiceCapture) {
      healEngineAfterVoiceStop(activeClipId, withNativeRecordingLatency({
        audioFilePath: parsed.data.audioFilePath,
        absoluteAudioFilePath: parsed.data.absoluteAudioFilePath,
        lengthBeats: parsed.data.lengthBeats,
        durationSeconds: parsed.data.durationSeconds,
        waveformPeaks: parsed.data.waveformPeaks,
        sourcePeakAmplitude: parsed.data.peakAmplitude,
        nativeInputLatencyMs: parsed.data.nativeInputLatencyMs,
        nativeOutputLatencyMs: parsed.data.nativeOutputLatencyMs,
      }, nativeLatency));
    } else {
      state.finalizeRecordingSession(withNativeRecordingLatency({
        notes: parsed.data.notes ?? [],
      }, nativeLatency));
      completeStop();
    }
  } catch {
    if (isVoiceCapture) {
      healEngineAfterVoiceStop(activeClipId, withNativeRecordingLatency({}, nativeLatency));
    } else {
      state.finalizeRecordingSession([]);
      completeStop();
    }
  }
}

function readNativeRecordingLatencySnapshot(): RecordingFinalizePayload | undefined {
  try {
    const rawResponse = sendNativeAudioCommand('engine_status_fast', {});
    if (!rawResponse) {
      return undefined;
    }
    const response = JSON.parse(rawResponse) as {
      ok?: boolean;
      data?: {
        inputLatencyMs?: number;
        outputLatencyMs?: number;
      };
    };
    if (!response.ok || !response.data) {
      return undefined;
    }

    return {
      nativeInputLatencyMs: finiteLatencyMs(response.data.inputLatencyMs),
      nativeOutputLatencyMs: finiteLatencyMs(response.data.outputLatencyMs),
    };
  } catch {
    return undefined;
  }
}

function withNativeRecordingLatency(
  payload: RecordingFinalizePayload,
  nativeLatency: RecordingFinalizePayload | undefined,
): RecordingFinalizePayload {
  return nativeLatency ? {...nativeLatency, ...payload} : payload;
}

function finiteLatencyMs(value: unknown): number {
  return Math.max(0, Number.isFinite(value as number) ? value as number : 0);
}

/**
 * Finalize voice take, re-bind arrangement, reopen output on the preferred device,
 * then one transport_play pause at clip end — no bridge transport calls mid-heal.
 */
function healEngineAfterVoiceStop(
  clipId: string | null,
  payload: RecordingFinalizePayload,
): void {
  suppressNativeBridgeSync = true;
  try {
    useDAWStore.setState({
      isPlaying: false,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      syncSource: 'ui',
    });
    const store = useDAWStore.getState();
    if (clipId) {
      store.clearLiveAudioPreview(clipId);
    }
    store.finalizeRecordingSession(payload);

    const state = useDAWStore.getState();
    const block = clipId ? state.blocks.find(item => item.id === clipId) ?? null : null;
    const endBeat = block ? block.startBeat + block.lengthBeats : state.playheadBeat;
    const positionSeconds = tempoMapSecondsAtBeat(endBeat, state.bpm, state.tempoMap);

    useDAWStore.setState({
      playheadBeat: endBeat,
      playheadSeconds: positionSeconds,
      isPlaying: false,
      playheadOwnedByUser: true,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      syncSource: 'ui',
    });

    refreshPlaybackOutputAfterVoice();
    resyncEngineAfterVoiceRecording();
    syncAllBlocksToEngine();
    sendNativeAudioCommand(
      'transport_play',
      buildNativeTransportPayload(false, endBeat, positionSeconds),
    );
  } finally {
    suppressNativeBridgeSync = false;
  }
}

function pauseTransportAtPlayhead(): void {
  const {playheadBeat, bpm, tempoMap} = useDAWStore.getState();
  const positionSeconds = tempoMapSecondsAtBeat(playheadBeat, bpm, tempoMap);
  useDAWStore.setState({
    isPlaying: false,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    syncSource: 'ui',
  });
  sendNativeAudioCommand(
    'transport_play',
    buildNativeTransportPayload(false, playheadBeat, positionSeconds),
  );
}

function pauseTransportAtClipEnd(clipId: string | null): void {
  const state = useDAWStore.getState();
  const block = clipId ? state.blocks.find(item => item.id === clipId) ?? null : null;
  const endBeat = block ? block.startBeat + block.lengthBeats : state.playheadBeat;
  const positionSeconds = tempoMapSecondsAtBeat(endBeat, state.bpm, state.tempoMap);

  useDAWStore.setState({
    isPlaying: false,
    playheadBeat: endBeat,
    playheadSeconds: positionSeconds,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    syncSource: 'ui',
  });
  sendNativeAudioCommand('transport_stop', {});
  sendNativeAudioCommand(
    'transport_play',
    buildNativeTransportPayload(false, endBeat, positionSeconds),
  );
}
