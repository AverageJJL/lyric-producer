import type {
  SongSeedReferenceAnalyzeResponse,
  SongSeedReferenceSource,
} from './songSeedTypes';
import {cyaniteAnalysisStatus} from './songSeedCyaniteNormalize';
import {
  CYANITE_ANALYSIS_FIELDS,
  CyaniteError,
  cyaniteGraphql,
  cyaniteMapError,
  cyanitePollOptions,
  pollCyaniteAnalysis,
  type CyaniteOptions,
} from './songSeedCyanite';
import {getCyaniteWaveformUrl} from './songSeedCyaniteLibrary';
import {text, type FetchLike, withTimeout} from './songSeedUtils';

type YouTubeTrackEnqueueSuccess = {
  __typename: 'YouTubeTrackEnqueueSuccess';
  enqueuedLibraryTrack?: Record<string, unknown>;
};

type YouTubeTrackEnqueueError = {
  __typename?: string;
  code?: string;
  message?: string;
};

type YouTubeTrackEnqueueResult = YouTubeTrackEnqueueSuccess | YouTubeTrackEnqueueError;

function attachSource(
  analysis: SongSeedReferenceAnalyzeResponse,
  source: SongSeedReferenceSource,
): SongSeedReferenceAnalyzeResponse {
  return analysis.ok ? {ok: true, analysis: {...analysis.analysis, source}} : analysis;
}

async function attachWaveform(
  analysis: SongSeedReferenceAnalyzeResponse,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<SongSeedReferenceAnalyzeResponse> {
  if (!analysis.ok) return analysis;
  const waveformUrl = await getCyaniteWaveformUrl(analysis.analysis.libraryTrackId, env, fetchImpl);
  return waveformUrl ? {ok: true, analysis: {...analysis.analysis, waveformUrl}} : analysis;
}

async function enqueueYouTubeTrack(
  source: SongSeedReferenceSource,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<Record<string, unknown>> {
  const data = await cyaniteGraphql<{youTubeTrackEnqueue: YouTubeTrackEnqueueResult}>(env, fetchImpl, `
    mutation CyaniteYouTubeTrackEnqueue($input: YouTubeTrackEnqueueInput!) {
      youTubeTrackEnqueue(input: $input) {
        __typename
        ... on YouTubeTrackEnqueueSuccess {
          enqueuedLibraryTrack { id title audioAnalysisV7 { ${CYANITE_ANALYSIS_FIELDS} } }
        }
        ... on YouTubeTrackEnqueueError { code message }
      }
    }
  `, {input: {videoUrl: source.url}});
  const result = data.youTubeTrackEnqueue;
  if (result.__typename === 'YouTubeTrackEnqueueSuccess') {
    const track = (result as YouTubeTrackEnqueueSuccess).enqueuedLibraryTrack;
    if (track) return track;
  }
  const message = text((result as YouTubeTrackEnqueueError).message)
    ?? text((result as YouTubeTrackEnqueueError).code)
    ?? 'Cyanite could not enqueue the YouTube reference.';
  throw new CyaniteError(cyaniteMapError(message), message);
}

export async function analyzeCyaniteYouTubeReference(
  source: SongSeedReferenceSource,
  env = process.env,
  fetchImpl: FetchLike = fetch,
  options: CyaniteOptions = {},
): Promise<SongSeedReferenceAnalyzeResponse> {
  const pollOptions = cyanitePollOptions(env, options);
  try {
    return await withTimeout((async () => {
      const enqueuedTrack = await enqueueYouTubeTrack(source, env, fetchImpl);
      const status = cyaniteAnalysisStatus(enqueuedTrack);
      if (status.status === 'finished') {
        return attachWaveform({ok: true as const, analysis: {...status.analysis, source}}, env, fetchImpl);
      }
      if (status.status === 'failed') {
        throw new CyaniteError('analysis_failed', status.error);
      }
      const trackId = text(enqueuedTrack.id);
      if (!trackId) {
        throw new CyaniteError('network_error', 'Cyanite returned a YouTube track without an id.');
      }
      return attachWaveform(attachSource({ok: true, analysis: await pollCyaniteAnalysis(env, fetchImpl, trackId, pollOptions)}, source), env, fetchImpl);
    })(), pollOptions.timeoutMs + 1000, 'Cyanite analysis timed out.');
  } catch (error) {
    if (error instanceof CyaniteError) return {ok: false, code: error.code, error: error.message};
    const message = error instanceof Error ? error.message : 'Cyanite YouTube reference analysis failed.';
    return {ok: false, code: cyaniteMapError(message), error: message};
  }
}
