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

type SeedCacheEntry = CacheEntry | {
  savedAt: string;
  analysisId: string;
};

type SeedCacheFile = {
  version: 1;
  entries: Record<string, SeedCacheEntry>;
  analyses?: Record<string, SongSeedReferenceAnalysis>;
};

type CacheRequest = {
  track?: SongSeedTrack;
  title?: string;
  artist?: string;
};

function emptyCache(): CacheFile {
  return {version: 1, entries: {}};
}

function emptySeedCache(): SeedCacheFile {
  return {version: 1, entries: {}, analyses: {}};
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

function readSeedCache(cachePath?: string): SeedCacheFile {
  if (!cachePath || !fs.existsSync(cachePath)) return emptySeedCache();
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, 'utf8')) as Partial<SeedCacheFile>;
    if (parsed.version !== 1 || !parsed.entries) return emptySeedCache();
    return {version: 1, entries: parsed.entries, analyses: parsed.analyses ?? {}};
  } catch {
    return emptySeedCache();
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

function analysisFromSeedEntry(cache: SeedCacheFile, entry: SeedCacheEntry | undefined): SongSeedReferenceAnalysis | null {
  if (!entry) return null;
  if ('analysis' in entry && isAnalysis(entry.analysis)) return entry.analysis;
  if ('analysisId' in entry) {
    const analysis = cache.analyses?.[entry.analysisId];
    if (isAnalysis(analysis)) return analysis;
  }
  return null;
}

function cachedAnalysis(analysis: SongSeedReferenceAnalysis, source?: SongSeedReferenceSource): SongSeedReferenceAnalysis {
  return {
    ...analysis,
    ...(source ? {source} : {}),
    cacheStatus: 'cache',
  };
}

function readCacheKeys(
  cache: CacheFile,
  keys: string[],
  source?: SongSeedReferenceSource,
): SongSeedReferenceAnalysis | null {
  for (const key of keys) {
    const analysis = cache.entries[key]?.analysis;
    if (isAnalysis(analysis)) return cachedAnalysis(analysis, source);
  }
  return null;
}

function readSeedCacheKeys(
  cache: SeedCacheFile,
  keys: string[],
  source?: SongSeedReferenceSource,
): SongSeedReferenceAnalysis | null {
  for (const key of keys) {
    const analysis = analysisFromSeedEntry(cache, cache.entries[key]);
    if (analysis) return cachedAnalysis(analysis, source);
  }
  return null;
}

export function readReferenceCacheBySong(
  cachePath: string | undefined,
  request: CacheRequest,
): SongSeedReferenceAnalysis | null {
  const key = referenceSongCacheKey(request);
  return key ? readCacheKeys(readCache(cachePath), [key]) : null;
}

export function readReferenceSeedCacheBySong(
  cachePath: string | undefined,
  request: CacheRequest,
): SongSeedReferenceAnalysis | null {
  const key = referenceSongCacheKey(request);
  return key ? readSeedCacheKeys(readSeedCache(cachePath), [key]) : null;
}

export function readReferenceCache(
  cachePath: string | undefined,
  request: CacheRequest,
  source: SongSeedReferenceSource,
): SongSeedReferenceAnalysis | null {
  return readCacheKeys(readCache(cachePath), referenceCacheKeys(request, source), source);
}

export function readReferenceSeedCache(
  cachePath: string | undefined,
  request: CacheRequest,
  source: SongSeedReferenceSource,
): SongSeedReferenceAnalysis | null {
  return readSeedCacheKeys(readSeedCache(cachePath), referenceCacheKeys(request, source), source);
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
