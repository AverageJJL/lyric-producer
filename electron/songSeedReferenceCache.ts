import * as fs from 'node:fs';
import * as path from 'node:path';

import type {
  SongSeedReferenceAnalysis,
  SongSeedReferenceSource,
  SongSeedTrack,
} from './songSeedTypes';
import {normalizeSongText, text} from './songSeedUtils';

type CacheEntry = {
  savedAt: string;
  analysis: SongSeedReferenceAnalysis;
};

type CacheFile = {
  version: 1;
  entries: Record<string, CacheEntry>;
};

type CacheRequest = {
  track?: SongSeedTrack;
  title?: string;
  artist?: string;
};

function emptyCache(): CacheFile {
  return {version: 1, entries: {}};
}

function isAnalysis(value: unknown): value is SongSeedReferenceAnalysis {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return raw.provider === 'cyanite'
    && typeof raw.libraryTrackId === 'string'
    && Array.isArray(raw.moodTags)
    && Array.isArray(raw.segments);
}

function readCache(cachePath?: string): CacheFile {
  if (!cachePath || !fs.existsSync(cachePath)) return emptyCache();
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Partial<CacheFile>;
    return parsed.version === 1 && parsed.entries ? {version: 1, entries: parsed.entries} : emptyCache();
  } catch {
    return emptyCache();
  }
}

function writeCache(cachePath: string | undefined, cache: CacheFile): void {
  if (!cachePath) return;
  fs.mkdirSync(path.dirname(cachePath), {recursive: true});
  fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
}

function requestTitle(request: CacheRequest): string | undefined {
  return text(request.track?.title) ?? text(request.title);
}

function requestArtist(request: CacheRequest): string | undefined {
  return text(request.track?.artist) ?? text(request.artist);
}

export function referenceSongCacheKey(request: CacheRequest): string | null {
  const title = normalizeSongText(requestTitle(request));
  const artist = normalizeSongText(requestArtist(request));
  return title ? `song:${title}:${artist}` : null;
}

export function referenceCacheKeys(request: CacheRequest, source: SongSeedReferenceSource): string[] {
  return [
    `youtube:${source.videoId}`,
    referenceSongCacheKey(request),
  ].filter((item): item is string => Boolean(item));
}

export function readReferenceCache(
  cachePath: string | undefined,
  request: CacheRequest,
  source: SongSeedReferenceSource,
): SongSeedReferenceAnalysis | null {
  const cache = readCache(cachePath);
  for (const key of referenceCacheKeys(request, source)) {
    const analysis = cache.entries[key]?.analysis;
    if (isAnalysis(analysis)) return {...analysis, source, cacheStatus: 'cache'};
  }
  return null;
}

export function writeReferenceCache(
  cachePath: string | undefined,
  request: CacheRequest,
  source: SongSeedReferenceSource,
  analysis: SongSeedReferenceAnalysis,
): void {
  const cache = readCache(cachePath);
  const savedAt = new Date().toISOString();
  const normalized = {...analysis, source};
  for (const key of referenceCacheKeys(request, source)) {
    cache.entries[key] = {savedAt, analysis: normalized};
  }
  writeCache(cachePath, cache);
}
