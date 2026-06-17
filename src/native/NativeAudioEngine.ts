type DAWCommandPayload = Record<string, unknown>;

type NativeAudioEngineModule = {
  sendCommand: (command: string, payloadJson: string) => string;
};

declare global {
  interface Window {
    audioEngine?: NativeAudioEngineModule & {
      onEvent?: (
        eventName: string,
        callback: (payloadJson: string) => void,
      ) => () => void;
    };
  }
}

export function sendNativeAudioCommand(
  command: string,
  payload: DAWCommandPayload,
): string | null {
  const audioEngine = globalThis.window?.audioEngine;
  if (!audioEngine) {
    return null;
  }

  const response = audioEngine.sendCommand(command, JSON.stringify(payload));
  return response;
}
