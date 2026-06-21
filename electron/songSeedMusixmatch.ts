import type {
  SongSeedLyricsRequest,
  SongSeedLyricsResponse,
  SongSeedLyricStructure,
  SongSeedLyricStructureRole,
  SongSeedSearchRequest,
  SongSeedSearchResponse,
  SongSeedTrack,
} from './songSeedTypes';
import {enrichSongSeedArtwork, musixmatchAlbumCoverUrlFromRecord} from './songSeedArtwork';
import {getMusixmatchSyncedLyrics} from './songSeedMusixmatchSubtitle';
import {numberText, numberValue, text, type FetchLike, yearFromDate} from './songSeedUtils';

export {parseMusixmatchSubtitlePayload} from './songSeedMusixmatchSubtitle';

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

const STRUCTURE_ROLES: SongSeedLyricStructureRole[] = ['intro', 'verse', 'pre-chorus', 'chorus', 'hook', 'bridge', 'outro'];

type StructureLookup = {structure?: SongSeedLyricStructure; reason?: string};

function rawDumpStructure(payload: unknown): unknown {
  const body = (payload as {message?: {body?: unknown}})?.message?.body;
  const item = Array.isArray(body) ? body[0] : body;
  return (item as {structure?: unknown} | undefined)?.structure;
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
    const structureFlag = track.has_track_structure;
    const hasTrackStructure = structureFlag === undefined
      ? undefined
      : structureFlag === true || Number(structureFlag) === 1;
    const isrc = text(track.track_isrc);
    const albumId = numberText(track.album_id);
    const albumCoverUrl = musixmatchAlbumCoverUrlFromRecord(track);
    const commontrackId = numberText(track.commontrack_id);
    return [{
      id,
      title,
      artist: text(track.artist_name),
      album: text(track.album_name),
      ...(albumId ? {albumId} : {}),
      ...(albumCoverUrl ? {albumCoverUrl, artworkSource: 'musixmatch' as const} : {}),
      releaseYear: yearFromDate(track.first_release_date),
      ...(isrc ? {isrc} : {}),
      ...(commontrackId ? {commontrackId} : {}),
      hasLyrics: numberValue(track.has_lyrics) === 1,
      ...(hasTrackStructure !== undefined ? {hasTrackStructure} : {}),
      source: 'musixmatch' as const,
    }];
  });
}

export function parseMusixmatchDumpPayload(payload: unknown): SongSeedLyricStructure | undefined {
  return parseMusixmatchStructureValue(rawDumpStructure(payload));
}

function parseMusixmatchStructureValue(structure: unknown): SongSeedLyricStructure | undefined {
  if (!structure || typeof structure !== 'object') return undefined;
  const raw = structure as Record<string, unknown>;
  const normalized: SongSeedLyricStructure = {};
  STRUCTURE_ROLES.forEach(role => {
    const value = raw[role] as {lines?: unknown} | undefined;
    const lines = Array.isArray(value?.lines)
      ? value.lines.filter((line): line is number => typeof line === 'number' && Number.isInteger(line) && line >= 0)
      : [];
    if (lines.length > 0) {
      normalized[role] = Array.from(new Set(lines)).sort((left, right) => left - right);
    }
  });
  return Object.keys(normalized).length > 0 ? normalized : undefined;
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
    const tracks = parseMusixmatchSearchPayload(payload);
    return {ok: true, tracks: await enrichSongSeedArtwork(tracks, env, fetchImpl, query)};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, code: 'network_error', error: message};
  }
}

async function getMusixmatchDumpStructure(
  trackIsrc: string | undefined,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<StructureLookup> {
  if (!trackIsrc) {
    return {reason: 'missing track_isrc from track.search'};
  }
  const url = new URL('https://api.musixmatch.com/ws/1.1/track.dump.get');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('track_isrc', trackIsrc);
  try {
    const response = await fetchImpl(url);
    if (!response.ok) {
      return {reason: `HTTP ${response.status}`};
    }
    const payload = await response.json();
    const structure = parseMusixmatchDumpPayload(payload);
    return structure ? {structure} : {reason: 'track.dump.get did not include message.body[0].structure'};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {reason: message};
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
    const payload = await response.json();
    const {lyrics, copyright} = parseMusixmatchLyricsPayload(payload);
    if (!lyrics) {
      return {ok: false, code: 'no_lyrics', error: 'No lyrics were returned.'};
    }
    let lookup: StructureLookup = {reason: 'selected track was not flagged with has_track_structure'};
    if (request.hasTrackStructure) {
      lookup = await getMusixmatchDumpStructure(text(request.trackIsrc), apiKey, fetchImpl);
    }
    const syncedLyrics = await getMusixmatchSyncedLyrics(trackId, apiKey, fetchImpl);
    const syncedFields = syncedLyrics.length > 0
      ? {syncedLyrics, syncedLyricsSource: 'musixmatch-subtitle' as const}
      : {};
    return lookup.structure
      ? {ok: true, trackId, lyrics, copyright, structure: lookup.structure, structureSource: 'catalog-feed', ...syncedFields}
      : {ok: true, trackId, lyrics, copyright, structureSource: 'unavailable', structureUnavailableReason: lookup.reason, ...syncedFields};
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {ok: false, code: 'network_error', error: message};
  }
}
