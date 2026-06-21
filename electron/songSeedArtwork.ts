import type {SongSeedTrack} from './songSeedTypes';
import {envTimeoutMs, normalizeSongText, text, type FetchLike, withTimeout} from './songSeedUtils';

const ALBUM_COVER_FIELDS = [
  'album_coverart_800x800',
  'album_coverart_500x500',
  'album_coverart_350x350',
  'album_coverart_100x100',
];
const ITUNES_FALLBACK_LIMIT = 8;
const ITUNES_SEARCH_LIMIT = 25;
const ITUNES_TIMEOUT_MS = 750;

const itunesArtworkCache = new Map<string, string>();
const itunesSearchCache = new Map<string, Promise<unknown | null>>();

function normalizedHttpsUrl(value: unknown): URL | undefined {
  const raw = text(value);
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === 'http:') url.protocol = 'https:';
    return url.protocol === 'https:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function musixmatchArtworkUrl(value: unknown): string | undefined {
  const url = normalizedHttpsUrl(value);
  if (!url || url.hostname !== 's.mxmcdn.net' || url.pathname.endsWith('/nocover.png')) return undefined;
  return url.toString();
}

function itunesArtworkUrl(value: unknown): string | undefined {
  const url = normalizedHttpsUrl(value);
  if (!url || !(url.hostname === 'mzstatic.com' || url.hostname.endsWith('.mzstatic.com'))) return undefined;
  return url.toString();
}

export function musixmatchAlbumCoverUrlFromRecord(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const field of ALBUM_COVER_FIELDS) {
    const url = musixmatchArtworkUrl(record[field]);
    if (url) return url;
  }
  return undefined;
}

export function parseMusixmatchAlbumCoverPayload(payload: unknown): string | undefined {
  const body = (payload as {message?: {body?: unknown}})?.message?.body;
  const item = Array.isArray(body) ? body[0] : body;
  const album = (item as {album?: Record<string, unknown>} | undefined)?.album ?? item;
  return album && typeof album === 'object'
    ? musixmatchAlbumCoverUrlFromRecord(album as Record<string, unknown>)
    : undefined;
}

function cacheKey(track: SongSeedTrack): string | undefined {
  const key = [track.title, track.artist, track.album].map(value => normalizeSongText(value)).join('|');
  return key.replace(/\|/g, '').length > 0 ? key : undefined;
}

function queryKey(query: string | undefined): string | undefined {
  const key = normalizeSongText(query);
  return key.length > 0 ? key : undefined;
}

function searchTermForTracks(tracks: SongSeedTrack[], query: string | undefined): string | undefined {
  const direct = text(query);
  if (direct) return direct;
  return text(tracks
    .slice(0, ITUNES_FALLBACK_LIMIT)
    .flatMap(track => [track.title, track.artist])
    .filter(Boolean)
    .join(' '));
}

function scoreText(candidate: unknown, target: string | undefined): number {
  const left = normalizeSongText(text(candidate));
  const right = normalizeSongText(target);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (left.includes(right) || right.includes(left)) return 0.85;
  const leftTokens = new Set(left.split(' ').filter(Boolean));
  const rightTokens = new Set(right.split(' ').filter(Boolean));
  const shared = [...leftTokens].filter(token => rightTokens.has(token)).length;
  return shared / Math.max(leftTokens.size, rightTokens.size, 1);
}

function scoreItunesResult(result: Record<string, unknown>, track: SongSeedTrack): number {
  const title = scoreText(result.trackName, track.title);
  const artist = scoreText(result.artistName, track.artist);
  const album = scoreText(result.collectionName, track.album);
  return title >= 0.75 && artist >= 0.45 ? (title * 0.55) + (artist * 0.3) + (album * 0.15) : 0;
}

function rankedItunesArtworkPayload(payload: unknown, track: SongSeedTrack): string | undefined {
  const results = (payload as {results?: unknown})?.results;
  if (!Array.isArray(results)) return undefined;
  const ranked = results
    .map(item => ({item: item as Record<string, unknown>, score: scoreItunesResult(item as Record<string, unknown>, track)}))
    .filter(({score}) => score >= 0.7)
    .sort((left, right) => right.score - left.score);
  return itunesArtworkUrl(ranked[0]?.item.artworkUrl100);
}

export function parseItunesArtworkPayload(payload: unknown, track: SongSeedTrack): string | undefined {
  return rankedItunesArtworkPayload(payload, track);
}

async function getItunesSearchPayload(
  query: string | undefined,
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
): Promise<unknown | null> {
  const key = queryKey(query);
  if (!key) return null;
  const cached = itunesSearchCache.get(key);
  if (cached) return cached;
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', query ?? key);
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', String(ITUNES_SEARCH_LIMIT));
  url.searchParams.set('country', 'US');
  const request = (async () => {
    try {
      const response = await withTimeout(
        fetchImpl(url),
        envTimeoutMs(env, 'ITUNES_ARTWORK_TIMEOUT_MS', ITUNES_TIMEOUT_MS),
        'iTunes artwork timed out.',
      );
      return response.ok ? await response.json() : null;
    } catch {
      return null;
    }
  })();
  itunesSearchCache.set(key, request);
  return request;
}

export async function enrichSongSeedArtwork(
  tracks: SongSeedTrack[],
  env: NodeJS.ProcessEnv,
  fetchImpl: FetchLike,
  query?: string,
): Promise<SongSeedTrack[]> {
  const fallbackTracks = tracks.slice(0, ITUNES_FALLBACK_LIMIT).filter(track => !track.albumCoverUrl);
  if (fallbackTracks.length === 0) return tracks;
  const byKey = new Map(fallbackTracks.flatMap(track => {
    const key = cacheKey(track);
    return key ? [[key, track] as const] : [];
  }));
  if (byKey.size === 0) return tracks;
  const missingTracks = [...byKey].filter(([key]) => !itunesArtworkCache.has(key));
  if (missingTracks.length > 0) {
    const payload = await getItunesSearchPayload(searchTermForTracks(fallbackTracks, query), env, fetchImpl);
    missingTracks.forEach(([key, track]) => {
      const artwork = payload ? rankedItunesArtworkPayload(payload, track) : undefined;
      if (artwork) itunesArtworkCache.set(key, artwork);
    });
  }
  const covers = new Map([...byKey].map(([key]) => [key, itunesArtworkCache.get(key)]));
  return tracks.map(track => {
    const key = cacheKey(track);
    const cover = key ? covers.get(key) : undefined;
    return cover && !track.albumCoverUrl ? {...track, albumCoverUrl: cover, artworkSource: 'itunes'} : track;
  });
}

export function clearSongSeedArtworkCache(): void {
  itunesArtworkCache.clear();
  itunesSearchCache.clear();
}
