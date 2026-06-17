/**
 * Routes native onSpectrogramReady payloads into clip spectrogram metadata.
 */

import type {SpectrogramReadyEvent} from '../native/spectrogramContract';
import type {DAWStore} from './useDAWStore';

export function applySpectrogramReadyPayload(
  payload: SpectrogramReadyEvent,
  store: Pick<DAWStore, 'applySpectrogramReady'>,
): void {
  if (!payload.requestId) {
    return;
  }
  store.applySpectrogramReady(payload);
}
