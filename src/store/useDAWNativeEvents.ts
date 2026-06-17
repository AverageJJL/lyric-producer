import {useEffect} from 'react';

import type {SpectrogramReadyEvent} from '../native/spectrogramContract';
import {
  createNativeAudioEngineEventEmitter,
  MIX_METER_UPDATE_EVENT,
  RECORDING_UPDATE_EVENT,
  SPECTROGRAM_READY_EVENT,
  TRANSPORT_UPDATE_EVENT,
} from '../native/NativeAudioEngineEvents';
import {applyRecordingUpdatePayload, type RecordingUpdatePayload} from './recordingUpdateRoute';
import {applySpectrogramReadyPayload} from './spectrogramUpdateRoute';
import {applyMixMeterUpdatePayload} from './mixMeterStore';
import {useDAWStore} from './useDAWStore';

type TransportUpdatePayload = {
  isPlaying?: boolean;
  positionSeconds?: number;
  positionBeat?: number;
  bpm?: number;
  clickTrackEnabled?: boolean;
};

function parseJsonPayload<T>(rawPayload: unknown): T {
  if (typeof rawPayload === 'string') {
    try {
      return JSON.parse(rawPayload) as T;
    } catch {
      return {} as T;
    }
  }

  if (rawPayload && typeof rawPayload === 'object') {
    return rawPayload as T;
  }

  return {} as T;
}

export function useDAWNativeEvents(): void {
  useEffect(() => {
    const emitter = createNativeAudioEngineEventEmitter();
    if (!emitter) {
      return;
    }

    const transportSubscription = emitter.addListener(
      TRANSPORT_UPDATE_EVENT,
      (rawPayload: unknown) => {
        const payload = parseJsonPayload<TransportUpdatePayload>(rawPayload);
        useDAWStore.getState().applyEngineTransportState(payload);
      },
    );

    const recordingSubscription = emitter.addListener(
      RECORDING_UPDATE_EVENT,
      (rawPayload: unknown) => {
        const payload = parseJsonPayload<RecordingUpdatePayload>(rawPayload);
        applyRecordingUpdatePayload(payload, useDAWStore.getState());
      },
    );

    const spectrogramSubscription = emitter.addListener(
      SPECTROGRAM_READY_EVENT,
      (rawPayload: unknown) => {
        const payload = parseJsonPayload<SpectrogramReadyEvent>(rawPayload);
        applySpectrogramReadyPayload(payload, useDAWStore.getState());
      },
    );

    const meterSubscription = emitter.addListener(
      MIX_METER_UPDATE_EVENT,
      (rawPayload: unknown) => {
        applyMixMeterUpdatePayload(parseJsonPayload<unknown>(rawPayload));
      },
    );

    return () => {
      transportSubscription.remove();
      recordingSubscription.remove();
      spectrogramSubscription.remove();
      meterSubscription.remove();
    };
  }, []);
}
