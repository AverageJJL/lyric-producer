import {useDAWStore} from '../store/useDAWStore';

/** Payload fields the C++ engine accepts for transport seek/play. */
export type NativeTransportPayload = {
  isPlaying: boolean;
  positionBeat: number;
  positionSeconds?: number;
};

export function buildNativeTransportPayload(
  isPlaying: boolean,
  playheadBeat: number,
  playheadSeconds: number,
): NativeTransportPayload {
  return {
    isPlaying,
    positionBeat: playheadBeat,
    positionSeconds: playheadSeconds,
  };
}

export function applyTransportStatusFromResponse(
  response: string | null,
  acknowledgedPlayRequest = false,
): void {
  if (!response) {
    return;
  }

  try {
    const parsed = JSON.parse(response) as {
      ok?: boolean;
      data?: {
        positionBeat?: number;
        positionSeconds?: number;
        isPlaying?: boolean;
        bpm?: number;
        clickTrackEnabled?: boolean;
      };
    };
    if (!parsed.ok) {
      return;
    }

    useDAWStore.getState().applyEngineTransportState({
      ...(parsed.data ?? {}),
      isPlaying: acknowledgedPlayRequest ? true : parsed.data?.isPlaying,
    });
  } catch {
    // ignore malformed engine JSON
  }
}
