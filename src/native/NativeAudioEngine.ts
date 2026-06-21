type DAWCommandPayload = Record<string, unknown>;

type NativeAudioEngineModule = {
  sendCommand: (command: string, payloadJson: string) => string;
  sendCommandAsync?: (command: string, payloadJson: string) => Promise<string>;
};

const ASYNC_REQUIRED_COMMANDS = new Set([
  'analyze_audio_file',
  'play_sample',
  'prepare_audio_file_for_playback',
  'return_to_zero',
  'start_pattern_preview',
  'transport_stop',
  'transport_play',
  'upsert_audio_clip',
]);

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

  return audioEngine.sendCommand(command, JSON.stringify(payload));
}

export function sendNativeAudioCommandAsync(
  command: string,
  payload: DAWCommandPayload,
): Promise<string | null> {
  const audioEngine = globalThis.window?.audioEngine;
  if (!audioEngine) {
    return Promise.resolve(null);
  }

  const payloadJson = JSON.stringify(payload);
  if (audioEngine.sendCommandAsync) {
    return audioEngine.sendCommandAsync(command, payloadJson);
  }

  // These commands may decode media, bind file-backed clips, prepare the audio
  // device, or rebuild playback state. Falling back to sendSync would recreate
  // the exact renderer-freeze path this async bridge is meant to remove.
  if (ASYNC_REQUIRED_COMMANDS.has(command)) {
    return Promise.resolve(null);
  }

  return Promise.resolve(audioEngine.sendCommand(command, payloadJson));
}
