type NativeAudioEngineEventSubscription = {
  remove: () => void;
};

type NativeAudioEngineEventEmitter = {
  addListener: (
    eventName: string,
    callback: (payload: unknown) => void,
  ) => NativeAudioEngineEventSubscription;
};

export function createNativeAudioEngineEventEmitter(): NativeAudioEngineEventEmitter | null {
  const audioEngine = globalThis.window?.audioEngine;
  if (!audioEngine?.onEvent) {
    return null;
  }

  return {
    addListener(eventName, callback) {
      const unsubscribe = audioEngine.onEvent!(eventName, callback);
      return {remove: unsubscribe};
    },
  };
}

export {SPECTROGRAM_READY_EVENT} from './spectrogramContract';

export const TRANSPORT_UPDATE_EVENT = 'onTransportUpdate';
export const RECORDING_UPDATE_EVENT = 'onRecordingUpdate';
export const DRUM_PATTERN_STEP_EVENT = 'onDrumPatternStep';
export const MIX_METER_UPDATE_EVENT = 'onMixMeterUpdate';
