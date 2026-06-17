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

export function applyTransportStatusFromResponse(response: string | null): void {
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
    if (!parsed.ok || !parsed.data) {
      return;
    }

    useDAWStore.getState().applyEngineTransportState(parsed.data);
  } catch {
    // ignore malformed engine JSON
  }
}
