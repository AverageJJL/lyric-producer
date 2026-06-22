import type {
  SongSeedReferenceAnalyzeRequest,
  SongSeedReferenceAnalyzeResponse,
} from './songSeedTypes';
import {CyaniteError} from './songSeedCyanite';
import {findReusableCyaniteLibraryReference, getCyaniteWaveformUrl} from './songSeedCyaniteLibrary';
import {analyzeCyaniteYouTubeReference} from './songSeedCyaniteYoutube';
import {
  readReferenceCache,
  readReferenceCacheBySong,
  readReferenceSeedCache,
  readReferenceSeedCacheBySong,
  writeReferenceCache,
} from './songSeedReferenceCache';
import {findYouTubeReference} from './songSeedYouTube';
import {type FetchLike} from './songSeedUtils';
import {PUBLIC_DEMO_CYANITE_LIMIT_MESSAGE} from './publicDemoConfig';

export type SongSeedReferenceOptions = {
  cachePath?: string;
  seedCachePath?: string;
  demoMode?: boolean;
  demoLimitMessage?: string;
};

export async function analyzeSongSeedReference(
  request: SongSeedReferenceAnalyzeRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
  options: SongSeedReferenceOptions = {},
): Promise<SongSeedReferenceAnalyzeResponse> {
  const cachedBySong = readReferenceCacheBySong(options.cachePath, request)
    ?? readReferenceSeedCacheBySong(options.seedCachePath, request);
  if (cachedBySong) return {ok: true, analysis: cachedBySong, cacheStatus: 'cache'};

  if (options.demoMode) {
    return {
      ok: false,
      code: 'limit_exceeded',
      error: options.demoLimitMessage ?? PUBLIC_DEMO_CYANITE_LIMIT_MESSAGE,
    };
  }

  const source = await findYouTubeReference(request, env, fetchImpl);
  if (!source.ok) {
    return source;
  }

  const cached = readReferenceCache(options.cachePath, request, source.source)
    ?? readReferenceSeedCache(options.seedCachePath, request, source.source);
  if (cached) return {ok: true, analysis: cached, cacheStatus: 'cache'};

  try {
    const reusable = await findReusableCyaniteLibraryReference(request, source.source, env, fetchImpl);
    if (reusable) {
      const waveformUrl = await getCyaniteWaveformUrl(reusable.libraryTrackId, env, fetchImpl);
      const analysis = {...reusable, waveformUrl: waveformUrl ?? reusable.waveformUrl};
      writeReferenceCache(options.cachePath, request, source.source, analysis);
      return {ok: true, analysis, cacheStatus: 'library'};
    }
  } catch (error) {
    if (error instanceof CyaniteError && error.code === 'missing_key') {
      return {ok: false, code: error.code, error: error.message, source: source.source};
    }
  }
  const analyzed = await analyzeCyaniteYouTubeReference(source.source, env, fetchImpl);
  if (analyzed.ok) {
    const analysis = {...analyzed.analysis, cacheStatus: 'analyzed' as const};
    writeReferenceCache(options.cachePath, request, source.source, analysis);
    return {ok: true, analysis, cacheStatus: 'analyzed'};
  }
  return analyzed;
}
