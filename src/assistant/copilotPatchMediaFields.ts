import {canonicalJsonStringify} from '../arrangement/canonicalJson';
import {APC_PATHS} from '../arrangement/apc';
import type {ProjectSnapshot} from '../arrangement/projectSnapshot';
import {STRIPPED_CLIP_FIELDS} from './apcSourceTree';

export const MAX_CREATED_AUDIO_CLIP_WAVEFORM_PEAKS = 512;

function downsamplePeaksMaxPool(peaks: number[], targetCount: number): number[] {
  if (targetCount <= 0 || peaks.length === 0) {
    return [];
  }
  if (peaks.length <= targetCount) {
    return peaks;
  }
  const out: number[] = [];
  const ratio = peaks.length / targetCount;
  for (let index = 0; index < targetCount; index += 1) {
    const start = Math.floor(index * ratio);
    const end = Math.max(start + 1, Math.floor((index + 1) * ratio));
    let max = 0;
    for (let peakIndex = start; peakIndex < end; peakIndex += 1) {
      const peak = peaks[peakIndex];
      if (typeof peak === 'number' && Number.isFinite(peak)) {
        max = Math.max(max, Math.max(0, Math.min(1, peak)));
      }
    }
    out.push(max);
  }
  return out;
}

function compactCreatedAudioClipFields(content: string): string {
  try {
    const clip = JSON.parse(content) as Record<string, unknown>;
    if (Array.isArray(clip.waveformPeaks)) {
      clip.waveformPeaks = downsamplePeaksMaxPool(
        clip.waveformPeaks.filter((peak): peak is number =>
          typeof peak === 'number' && Number.isFinite(peak),
        ),
        MAX_CREATED_AUDIO_CLIP_WAVEFORM_PEAKS,
      );
    }
    return canonicalJsonStringify(clip);
  } catch {
    return content;
  }
}

/** When a clip is edited through the sanitized agent view, restore hidden media metadata. */
export function mergeStrippedClipFields(path: string, original: string | undefined, next: string): string {
  if (!path.startsWith('clips/') || original === undefined) {
    return next;
  }
  try {
    const originalJson = JSON.parse(original) as Record<string, unknown>;
    const nextJson = JSON.parse(next) as Record<string, unknown>;
    for (const field of STRIPPED_CLIP_FIELDS) {
      if (field in originalJson && !(field in nextJson)) {
        nextJson[field] = originalJson[field];
      }
    }
    return canonicalJsonStringify(nextJson);
  } catch {
    return next;
  }
}

export function restoreLiveClipStrippedFields(files: Map<string, string>, snapshot: ProjectSnapshot): void {
  snapshot.blocks.forEach(block => {
    const path = APC_PATHS.clip(block.id);
    const current = files.get(path);
    if (current) {
      files.set(path, mergeStrippedClipFields(path, canonicalJsonStringify(block), current));
    }
  });
}

export function sourceClipByAudioPath(files: Map<string, string>): Map<string, string> {
  const byPath = new Map<string, string>();
  for (const [path, content] of files) {
    if (!path.startsWith('clips/')) {
      continue;
    }
    try {
      const clip = JSON.parse(content) as {type?: unknown; audioFilePath?: unknown};
      if (clip.type === 'audio' && typeof clip.audioFilePath === 'string') {
        byPath.set(clip.audioFilePath, content);
      }
    } catch {
      /* validation reports malformed clip JSON later */
    }
  }
  return byPath;
}

export function mergeCreatedAudioClipFields(
  sourceByAudioPath: Map<string, string>,
  path: string,
  next: string,
): string {
  if (!path.startsWith('clips/')) {
    return next;
  }
  try {
    const clip = JSON.parse(next) as {type?: unknown; audioFilePath?: unknown};
    const source = clip.type === 'audio' && typeof clip.audioFilePath === 'string'
      ? sourceByAudioPath.get(clip.audioFilePath)
      : undefined;
    return compactCreatedAudioClipFields(mergeStrippedClipFields(path, source, next));
  } catch {
    return next;
  }
}
