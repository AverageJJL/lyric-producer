import {sendNativeAudioCommandAsync} from './NativeAudioEngine';

export type PlaybackAudioFile = {
  name?: string;
  absolutePath: string;
  relativePath: string;
};

function parseCommandData(response: string | null): Record<string, unknown> | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    return parsed.ok === true ? parsed.data ?? null : null;
  } catch {
    return null;
  }
}

export function audioPathIsPlaybackReady(path?: string): boolean {
  return typeof path === 'string' && /\.wav$/i.test(path);
}

export function audioFileNeedsPlaybackPreparation(file: PlaybackAudioFile): boolean {
  return !audioPathIsPlaybackReady(file.relativePath) && !audioPathIsPlaybackReady(file.absolutePath);
}

export async function prepareAudioFileForPlayback(
  file: PlaybackAudioFile,
): Promise<PlaybackAudioFile | null> {
  if (!audioFileNeedsPlaybackPreparation(file)) {
    return file;
  }

  const data = parseCommandData(await sendNativeAudioCommandAsync(
    'prepare_audio_file_for_playback',
    {
      absoluteAudioFilePath: file.absolutePath,
      relativeAudioFilePath: file.relativePath,
    },
  ));
  const absolutePath = data?.absoluteAudioFilePath;
  const relativePath = data?.relativeAudioFilePath;
  if (typeof absolutePath !== 'string' || typeof relativePath !== 'string') {
    return null;
  }

  return {
    ...file,
    absolutePath,
    relativePath,
  };
}
