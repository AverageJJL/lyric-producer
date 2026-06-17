/**
 * Day-0 spectrogram async contract — shared between Agent A (UI trigger) and Agent B (C++ impl).
 * Append-only after Day 0. IPC is synchronous today; render completes via engine event.
 */

import {sendNativeAudioCommand} from './NativeAudioEngine';

export const SPECTROGRAM_READY_EVENT = 'onSpectrogramReady';

/** Minimum trigger scope for Phase 1: recorded WAV files only. */
export type SpectrogramAudioSource = 'recorded_wav';

export type RenderSpectrogramRequest = {
  requestId: string;
  audioPath: string;
  width: number;
  height: number;
  /** Phase 1 gate — only recorded voice/reference WAVs under asset root. */
  source: SpectrogramAudioSource;
};

export type RenderSpectrogramCommand = {
  command: 'render_spectrogram';
  payload: RenderSpectrogramRequest;
};

export type SpectrogramReadyEvent = {
  requestId: string;
  pngPath: string;
  ok: boolean;
  error?: string;
};

export function createSpectrogramRequestId(): string {
  return `spec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Default PNG dimensions for timeline/assistant previews. */
export const DEFAULT_SPECTROGRAM_SIZE = {width: 512, height: 256} as const;

/** Fire native mel render; completion arrives on {@link SPECTROGRAM_READY_EVENT}. */
export function dispatchRenderSpectrogram(
  request: RenderSpectrogramRequest,
): {requestId: string; started: boolean} {
  const response = sendNativeAudioCommand('render_spectrogram', request);
  if (!response) {
    return {requestId: request.requestId, started: false};
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean};
    return {requestId: request.requestId, started: parsed.ok === true};
  } catch {
    return {requestId: request.requestId, started: false};
  }
}

export function buildRecordedWavSpectrogramRequest(
  audioPath: string,
  requestId = createSpectrogramRequestId(),
): RenderSpectrogramRequest {
  return {
    requestId,
    audioPath,
    width: DEFAULT_SPECTROGRAM_SIZE.width,
    height: DEFAULT_SPECTROGRAM_SIZE.height,
    source: 'recorded_wav',
  };
}
