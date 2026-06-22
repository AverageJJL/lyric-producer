import * as fs from 'node:fs';
import type {
  SongSeedBpmKeyCandidate,
  SongSeedBpmKeyRequest,
  SongSeedBpmKeyResponse,
  SongSeedLyricsRequest,
  SongSeedLyricsResponse,
  SongSeedLyricStructure,
  SongSeedSearchRequest,
  SongSeedSearchResponse,
  SongSeedTrack,
} from './songSeedTypes';
import {normalizeSongText, text} from './songSeedUtils';

type DemoSongEntry = {
  track: SongSeedTrack;
  bpm?: number;
  key?: string;
  confidence?: number;
  note?: string;
  lyrics?: string;
  copyright?: string;
  structure?: SongSeedLyricStructure;
};

type DemoSongFile = {
  version: 1;
  tracks: DemoSongEntry[];
};

function readDemoSongFile(filePath?: string): DemoSongFile {
  if (!filePath || !fs.existsSync(filePath)) return {version: 1, tracks: []};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<DemoSongFile>;
    return parsed.version === 1 && Array.isArray(parsed.tracks)
      ? {version: 1, tracks: parsed.tracks.filter(entry => entry?.track?.id)}
      : {version: 1, tracks: []};
  } catch {
    return {version: 1, tracks: []};
  }
}

function entryText(entry: DemoSongEntry): string {
  return normalizeSongText([
    entry.track.title,
    entry.track.artist,
    entry.track.album,
    entry.track.releaseYear,
  ].filter(Boolean).join(' '));
}

function trackMatches(entry: DemoSongEntry, query: string): boolean {
  const normalized = normalizeSongText(query);
  return normalized.length > 0 && entryText(entry).includes(normalized);
}

function requestMatches(entry: DemoSongEntry, request: SongSeedBpmKeyRequest): boolean {
  const title = normalizeSongText(request.title);
  const artist = normalizeSongText(request.artist);
  const trackTitle = normalizeSongText(entry.track.title);
  const trackArtist = normalizeSongText(entry.track.artist);
  return Boolean(title && trackTitle === title && (!artist || trackArtist.includes(artist) || artist.includes(trackArtist)));
}

function missingProvider(message: string) {
  return {ok: false as const, code: 'not_found' as const, error: message};
}

export function searchDemoSongSeedTracks(
  request: SongSeedSearchRequest,
  filePath?: string,
): SongSeedSearchResponse {
  const query = text(request.query);
  if (!query || query.length < 2) {
    return {ok: false, code: 'empty_query', error: 'Type at least two characters.'};
  }
  const limit = Math.max(1, Math.min(request.limit ?? 8, 12));
  const tracks = readDemoSongFile(filePath).tracks
    .filter(entry => trackMatches(entry, query))
    .slice(0, limit)
    .map(entry => entry.track);
  return {ok: true, tracks};
}

export function getDemoSongSeedLyrics(
  request: SongSeedLyricsRequest,
  filePath?: string,
): SongSeedLyricsResponse {
  const trackId = text(request.trackId);
  if (!trackId) {
    return {ok: false, code: 'empty_query', error: 'Select a song first.'};
  }
  const entry = readDemoSongFile(filePath).tracks.find(item => item.track.id === trackId);
  if (!entry?.lyrics) {
    return missingProvider('The public demo only includes cached lyrics for bundled demo songs.');
  }
  return {
    ok: true,
    trackId,
    lyrics: entry.lyrics,
    copyright: entry.copyright,
    structure: entry.structure,
    structureSource: entry.structure ? 'catalog-feed' : 'unavailable',
    ...(entry.structure ? {} : {structureUnavailableReason: 'Public demo fixture has no structure.'}),
  };
}

function candidate(entry: DemoSongEntry): SongSeedBpmKeyCandidate {
  return {
    title: entry.track.title,
    artist: entry.track.artist,
    album: entry.track.album,
    releaseYear: entry.track.releaseYear,
    bpm: entry.bpm,
    key: entry.key,
    source: 'public-context',
    confidence: entry.confidence ?? 0.8,
    matchReason: entry.note ?? 'Bundled public-demo metadata.',
  };
}

export function lookupDemoSongSeedBpmKey(
  request: SongSeedBpmKeyRequest,
  filePath?: string,
): SongSeedBpmKeyResponse {
  const title = text(request.title);
  if (!title) {
    return {ok: false, code: 'empty_query', error: 'Select a song first.'};
  }
  const entry = readDemoSongFile(filePath).tracks.find(item => requestMatches(item, request));
  if (!entry) {
    return missingProvider('The public demo only includes cached metadata for bundled demo songs.');
  }
  const best = candidate(entry);
  return {
    ok: true,
    title: best.title,
    artist: best.artist,
    bpm: best.bpm,
    key: best.key,
    source: best.source,
    confidence: best.confidence,
    candidates: [best],
    note: best.matchReason,
  };
}
