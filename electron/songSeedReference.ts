import type {
  SongSeedReferenceAnalyzeRequest,
  SongSeedReferenceAnalyzeResponse,
} from './songSeedTypes';
import {CyaniteError} from './songSeedCyanite';
import {findReusableCyaniteLibraryReference, getCyaniteWaveformUrl} from './songSeedCyaniteLibrary';
import {analyzeCyaniteYouTubeReference} from './songSeedCyaniteYoutube';
import {readReferenceCache, writeReferenceCache} from './songSeedReferenceCache';
import {findYouTubeReference} from './songSeedYouTube';
import {type FetchLike} from './songSeedUtils';

export type SongSeedReferenceOptions = {
  cachePath?: string;
};

export async function analyzeSongSeedReference(
  request: SongSeedReferenceAnalyzeRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
  options: SongSeedReferenceOptions = {},
): Promise<SongSeedReferenceAnalyzeResponse> {
  const source = await findYouTubeReference(request, env, fetchImpl);
  if (!source.ok) {
    return source;
  }
  const cached = readReferenceCache(options.cachePath, request, source.source);
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
  if (!request.allowCreditSpend) {
    return {
      ok: false,
      code: 'confirmation_required',
      error: 'Spend 1 Cyanite analysis credit on this YouTube reference?',
      source: source.source,
    };
  }
  const analyzed = await analyzeCyaniteYouTubeReference(source.source, env, fetchImpl);
  if (analyzed.ok) {
    const analysis = {...analyzed.analysis, cacheStatus: 'analyzed' as const};
    writeReferenceCache(options.cachePath, request, source.source, analysis);
    return {ok: true, analysis, cacheStatus: 'analyzed'};
  }
  return analyzed;
}
