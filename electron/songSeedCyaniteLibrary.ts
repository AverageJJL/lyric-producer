import type {
  SongSeedReferenceAnalysis,
  SongSeedReferenceAnalyzeRequest,
  SongSeedReferenceSource,
} from './songSeedTypes';
import {CYANITE_ANALYSIS_FIELDS, CyaniteError, cyaniteGraphql} from './songSeedCyanite';
import {cyaniteAnalysisStatus} from './songSeedCyaniteNormalize';
import {normalizeSongText, text, type FetchLike} from './songSeedUtils';

type LibraryTrackNode = Record<string, unknown>;

function requestTitle(request: SongSeedReferenceAnalyzeRequest): string | undefined {
  return text(request.track?.title) ?? text(request.title);
}

function requestArtist(request: SongSeedReferenceAnalyzeRequest): string | undefined {
  return text(request.track?.artist) ?? text(request.artist);
}

function words(value: string | undefined): string[] {
  return normalizeSongText(value).split(/\s+/).filter(word => word.length > 1);
}

function matchScore(track: LibraryTrackNode, request: SongSeedReferenceAnalyzeRequest, source: SongSeedReferenceSource): number {
  const haystack = normalizeSongText([track.title, source.title, source.channelTitle].filter(Boolean).join(' '));
  const titleWords = words(requestTitle(request));
  const artistWords = words(requestArtist(request));
  let score = 0;
  if (titleWords.length > 0 && titleWords.every(word => haystack.includes(word))) score += 0.54;
  if (artistWords.length > 0 && artistWords.every(word => haystack.includes(word))) score += 0.28;
  if (normalizeSongText(String(track.title ?? '')).includes(normalizeSongText(requestTitle(request)))) score += 0.14;
  return Math.min(1, score);
}

async function libraryTracksByTitle(
  title: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<LibraryTrackNode[]> {
  const data = await cyaniteGraphql<{libraryTracks?: {edges?: Array<{node?: LibraryTrackNode}>}}>(env, fetchImpl, `
    query CyaniteLibraryTracksByTitle($title: String!) {
      libraryTracks(filter: { title: $title }, first: 8) {
        edges { node { id title audioAnalysisV7 { ${CYANITE_ANALYSIS_FIELDS} } } }
      }
    }
  `, {title});
  return data.libraryTracks?.edges?.map(edge => edge.node).filter((node): node is LibraryTrackNode => Boolean(node)) ?? [];
}

export async function findReusableCyaniteLibraryReference(
  request: SongSeedReferenceAnalyzeRequest,
  source: SongSeedReferenceSource,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<SongSeedReferenceAnalysis | null> {
  const title = requestTitle(request);
  if (!title) return null;
  const candidates = await libraryTracksByTitle(title, env, fetchImpl);
  const reusable = candidates.flatMap(track => {
    const status = cyaniteAnalysisStatus(track);
    if (status.status !== 'finished') return [];
    return [{analysis: status.analysis, score: matchScore(track, request, source)}];
  }).sort((a, b) => b.score - a.score)[0];
  return reusable && reusable.score >= 0.58
    ? {...reusable.analysis, source, cacheStatus: 'library'}
    : null;
}

export async function getCyaniteWaveformUrl(
  trackId: string,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<string | undefined> {
  try {
    const data = await cyaniteGraphql<{libraryTrackWaveform: Record<string, unknown>}>(env, fetchImpl, `
      query CyaniteLibraryTrackWaveform($trackId: ID!) {
        libraryTrackWaveform(trackId: $trackId) {
          __typename
          ... on LibraryTrackWaveform { waveformUrl }
          ... on LibraryTrackWaveformError { message }
        }
      }
    `, {trackId});
    return text(data.libraryTrackWaveform.waveformUrl);
  } catch (error) {
    if (error instanceof CyaniteError && error.code === 'missing_key') throw error;
    return undefined;
  }
}
