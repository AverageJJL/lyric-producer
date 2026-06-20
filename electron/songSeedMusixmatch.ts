import type {
  SongSeedLyricsRequest,
  SongSeedLyricsResponse,
  SongSeedSearchRequest,
  SongSeedSearchResponse,
  SongSeedTrack,
} from './songSeedTypes';
import {numberText, numberValue, text, type FetchLike, yearFromDate} from './songSeedUtils';

function musixmatchKey(env: NodeJS.ProcessEnv): string | undefined {
  return text(env.MUSIXMATCH_API_KEY);
}

function musixmatchStatus(payload: unknown): number | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }
  return numberValue((payload as Record<string, unknown>).message
    && ((payload as {message?: {header?: {status_code?: unknown}}}).message?.header?.status_code));
}

function httpError(provider: string, status: number): {
  ok: false;
  code: 'network_error' | 'unauthorized';
  error: string;
} {
  return {
    ok: false,
    code: status === 401 ? 'unauthorized' : 'network_error',
    error: `${provider} returned ${status}.`,
  };
}

export function parseMusixmatchSearchPayload(payload: unknown): SongSeedTrack[] {
  const body = (payload as {message?: {body?: {track_list?: unknown}}})?.message?.body;
  const list = Array.isArray(body?.track_list) ? body.track_list : [];
  return list.flatMap(item => {
    const track = (item as {track?: Record<string, unknown>})?.track;
    const id = numberText(track?.track_id);
    const title = text(track?.track_name);
    if (!track || !id || !title) {
      return [];
    }
    return [{
      id,
      title,
      artist: text(track.artist_name),
      album: text(track.album_name),
      releaseYear: yearFromDate(track.first_release_date),
      hasLyrics: numberValue(track.has_lyrics) === 1,
      source: 'musixmatch' as const,
    }];
  });
}

export function parseMusixmatchLyricsPayload(payload: unknown): {
  lyrics?: string;
  copyright?: string;
} {
  const lyrics = (payload as {message?: {body?: {lyrics?: Record<string, unknown>}}})
    ?.message?.body?.lyrics;
  return {
    lyrics: text(lyrics?.lyrics_body),
    copyright: text(lyrics?.lyrics_copyright),
  };
}

export async function searchMusixmatchTracks(
  request: SongSeedSearchRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<SongSeedSearchResponse> {
  const query = text(request.query);
  if (!query || query.length < 2) {
    return {ok: false, code: 'empty_query', error: 'Type at least two characters.'};
  }
  const apiKey = musixmatchKey(env);
  if (!apiKey) {
    return {ok: false, code: 'missing_key', error: 'MUSIXMATCH_API_KEY is not set.'};
  }
  const url = new URL('https://api.musixmatch.com/ws/1.1/track.search');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('q_track', query);
  url.searchParams.set('f_has_lyrics', '1');
  url.searchParams.set('page_size', String(Math.max(1, Math.min(request.limit ?? 8, 12))));
  url.searchParams.set('page', '1');
  url.searchParams.set('s_track_rating', 'desc');
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return httpError('Musixmatch', response.status);
    }
    const payload = await response.json();
    const status = musixmatchStatus(payload);
    if (status && status >= 400) {
      return httpError('Musixmatch', status);
    }
    return {ok: true, tracks: parseMusixmatchSearchPayload(payload)};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, code: 'network_error', error: message};
  }
}

export async function getMusixmatchLyrics(
  request: SongSeedLyricsRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<SongSeedLyricsResponse> {
  const trackId = text(request.trackId);
  if (!trackId) {
    return {ok: false, code: 'empty_query', error: 'Select a song first.'};
  }
  const apiKey = musixmatchKey(env);
  if (!apiKey) {
    return {ok: false, code: 'missing_key', error: 'MUSIXMATCH_API_KEY is not set.'};
  }
  const url = new URL('https://api.musixmatch.com/ws/1.1/track.lyrics.get');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('track_id', trackId);
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return httpError('Musixmatch', response.status);
    }
    const {lyrics, copyright} = parseMusixmatchLyricsPayload(await response.json());
    if (!lyrics) {
      return {ok: false, code: 'no_lyrics', error: 'No lyrics were returned.'};
    }
    return {ok: true, trackId, lyrics, copyright};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, code: 'network_error', error: message};
  }
}
