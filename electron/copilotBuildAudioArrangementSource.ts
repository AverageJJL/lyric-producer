import type {ApcAgentTree} from './copilotAgentTools';

export type ClipFile = Record<string, unknown> & {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  trackId?: unknown;
  startBeat?: unknown;
  lengthBeats?: unknown;
  sourceLengthBeats?: unknown;
  sourceOffsetBeats?: unknown;
  audioFilePath?: unknown;
  patternId?: unknown;
  clipGainDb?: unknown;
  isLocked?: unknown;
  isFrozen?: unknown;
};

type TrackFile = {id?: unknown; name?: unknown; isLocked?: unknown; isFrozen?: unknown};

export type TimelineFile = {
  timeSignature?: {numerator?: unknown; denominator?: unknown};
  sections?: unknown;
};

export type Section = {id: string; name: string; startBeat: number; lengthBeats: number};
export type SectionSpec = {key: string; name: string; startBeat: number; endBeat: number};
export type SourceClip = {
  path: string;
  hash: string;
  id: string;
  name: string;
  trackId: string;
  trackName: string;
  startBeat: number;
  lengthBeats: number;
  sourceOffsetBeats: number;
  sourceLengthBeats: number;
  clip: ClipFile;
};

export function readJson<T>(tree: ApcAgentTree, path: string): T | null {
  try {
    return JSON.parse(tree.files[path] ?? 'null') as T;
  } catch {
    return null;
  }
}

export function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function sortedJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(sortedJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map(key => `${JSON.stringify(key)}:${sortedJson(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 36) || 'section';
}

export function roundBeat(value: number): number {
  return Number(value.toFixed(3));
}

export function wantsAudioArrangement(message: string): boolean {
  const text = message.toLowerCase();
  const arrangement = /\b(arrange|arrangement|structure|section|split|slice|chop|blocks?|demo|a\/b|dropout|breakdown|vocal[- ]space|hook|chorus|bigger|contrast|space)\b/.test(text);
  const sourceBound = /\b(audio|clip|block|stem|existing|current|without generating|without adding new music|no new music|using only)\b/.test(text);
  return arrangement && sourceBound;
}

export function wantsDropout(message: string): boolean {
  return /\b(dropout|vocal[- ]space|thin out|mutes?|muting|strip|remove|gain changes?)\b/i.test(message);
}

export function treeHash(tree: ApcAgentTree, path: string): string | null {
  return tree.index.find(entry => entry.path === path)?.contentHash ?? null;
}

function trackForClip(tree: ApcAgentTree, trackId: string): TrackFile | null {
  return readJson<TrackFile>(tree, `tracks/${encodeURIComponent(trackId)}.json`);
}

export function sourceClips(tree: ApcAgentTree): SourceClip[] {
  return Object.keys(tree.files)
    .filter(path => path.startsWith('clips/') && path.endsWith('.json'))
    .map(path => ({path, hash: treeHash(tree, path), clip: readJson<ClipFile>(tree, path)}))
    .map(({path, hash, clip}) => {
      const id = cleanString(clip?.id);
      const name = cleanString(clip?.name) ?? id;
      const trackId = cleanString(clip?.trackId);
      const startBeat = finiteNumber(clip?.startBeat);
      const lengthBeats = finiteNumber(clip?.lengthBeats);
      const audioFilePath = cleanString(clip?.audioFilePath);
      if (
        clip?.type !== 'audio' ||
        clip.patternId ||
        clip.isLocked === true ||
        clip.isFrozen === true ||
        !hash ||
        !id ||
        !name ||
        !trackId ||
        startBeat === null ||
        !lengthBeats ||
        !audioFilePath
      ) {
        return null;
      }
      const track = trackForClip(tree, trackId);
      if (track?.isLocked === true || track?.isFrozen === true) {
        return null;
      }
      const sourceLengthBeats = finiteNumber(clip.sourceLengthBeats) ?? lengthBeats;
      return {
        path,
        hash,
        id,
        name,
        trackId,
        trackName: cleanString(track?.name) ?? trackId,
        startBeat,
        lengthBeats,
        sourceOffsetBeats: finiteNumber(clip.sourceOffsetBeats) ?? 0,
        sourceLengthBeats: Math.max(1, sourceLengthBeats),
        clip,
      };
    })
    .filter((clip): clip is SourceClip => clip !== null)
    .sort((a, b) => a.startBeat - b.startBeat || a.trackName.localeCompare(b.trackName));
}
