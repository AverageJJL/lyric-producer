import type {
  SongSeedReferenceErrorCode,
  SongSeedReferenceSource,
  SongSeedTrack,
} from './songSeedTypes';
import {envTimeoutMs, normalizeSongText, text, type FetchLike, withTimeout} from './songSeedUtils';

type YouTubeSnippet = {
  title?: string;
  channelTitle?: string;
};

type YouTubeVideo = {
  id?: string;
  snippet?: YouTubeSnippet;
  contentDetails?: {duration?: string};
};

type YouTubeSearchItem = {
  id?: {videoId?: string};
  snippet?: YouTubeSnippet;
};

type YouTubeRequest = {
  track?: SongSeedTrack;
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
};

type YouTubeLookupResponse =
  | {ok: true; source: SongSeedReferenceSource}
  | {ok: false; code: SongSeedReferenceErrorCode; error: string};

const YOUTUBE_TIMEOUT_MS = 3200;
const MAX_CYANITE_YOUTUBE_SECONDS = 600;
const MIN_YOUTUBE_CONFIDENCE = 0.62;
const BAD_TITLE_TERMS = /\b(cover|karaoke|reaction|tutorial|instrumental|nightcore|8d)\b/i;
const LYRIC_TERM = /\blyrics?\b/i;
const OFFICIAL_TERM = /\bofficial\s+(audio|(?:music\s+)?video)\b/i;
const WORD_STOPLIST = new Set(['the', 'a', 'an', 'official', 'audio', 'video', 'feat', 'ft', 'featuring']);

function requestTitle(request: YouTubeRequest): string | undefined {
  return text(request.track?.title) ?? text(request.title);
}

function requestArtist(request: YouTubeRequest): string | undefined {
  return text(request.track?.artist) ?? text(request.artist);
}

function canonicalYouTubeUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

export function parseYouTubeDurationSeconds(value: string | undefined): number | null {
  const match = text(value)?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return (Number(match[1] ?? 0) * 3600) + (Number(match[2] ?? 0) * 60) + Number(match[3] ?? 0);
}

function words(value: string | undefined): string[] {
  return normalizeSongText(value)
    .split(/\s+/)
    .filter(word => word.length > 1 && !WORD_STOPLIST.has(word));
}

function searchableText(value: string | undefined): string {
  return normalizeSongText((value ?? '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/vevo$/i, ' VEVO'));
}

function hasAllWords(haystack: string, needles: string[]): boolean {
  return needles.length > 0 && needles.every(word => haystack.includes(word));
}

function allowsTerm(requestTitleValue: string | undefined, term: string): boolean {
  return normalizeSongText(requestTitleValue).includes(term);
}

export function scoreYouTubeReference(
  video: YouTubeVideo,
  request: YouTubeRequest,
): SongSeedReferenceSource | null {
  const videoId = text(video.id);
  const title = text(video.snippet?.title);
  const channelTitle = text(video.snippet?.channelTitle);
  const durationSeconds = parseYouTubeDurationSeconds(video.contentDetails?.duration);
  if (!videoId || !title || !channelTitle || !durationSeconds || durationSeconds > MAX_CYANITE_YOUTUBE_SECONDS) {
    return null;
  }
  const expectedTitle = requestTitle(request);
  const expectedArtist = requestArtist(request);
  const normalizedTitle = searchableText(title);
  const normalizedChannel = searchableText(channelTitle);
  const titleWords = words(expectedTitle);
  const artistWords = words(expectedArtist);
  let score = 0;
  const reasons: string[] = [];
  if (hasAllWords(normalizedTitle, titleWords)) {
    score += 0.3;
    reasons.push('title match');
  } else if (titleWords.some(word => normalizedTitle.includes(word))) {
    score += 0.12;
  }
  if (hasAllWords(`${normalizedTitle} ${normalizedChannel}`, artistWords)) {
    score += 0.18;
    reasons.push('artist match');
  }
  if (/\b(topic|official)\b/i.test(channelTitle) || normalizedChannel.endsWith(' topic') || normalizedChannel.endsWith('vevo')) {
    score += 0.18;
    reasons.push('official channel');
  }
  if (OFFICIAL_TERM.test(title)) {
    score += 0.16;
    reasons.push('official upload');
  } else if (/\baudio\b/i.test(title)) {
    score += 0.08;
  }
  if (durationSeconds >= 90 && durationSeconds <= 420) {
    score += 0.06;
  }
  if (BAD_TITLE_TERMS.test(title)) score -= 0.22;
  if (LYRIC_TERM.test(title)) score -= 0.08;
  if (/\blive\b/i.test(title) && !allowsTerm(expectedTitle, 'live')) score -= 0.14;
  if (/\b(remix|sped up|slowed)\b/i.test(title) && !allowsTerm(expectedTitle, 'remix')) score -= 0.16;
  const confidence = Math.max(0, Math.min(0.98, Number(score.toFixed(2))));
  return confidence >= MIN_YOUTUBE_CONFIDENCE
    ? {kind: 'youtube', url: canonicalYouTubeUrl(videoId), videoId, title, channelTitle, confidence, matchReason: reasons.join(', ')}
    : null;
}

export function selectBestYouTubeReference(
  videos: YouTubeVideo[],
  request: YouTubeRequest,
): SongSeedReferenceSource | null {
  return videos
    .map(video => scoreYouTubeReference(video, request))
    .filter((item): item is SongSeedReferenceSource => Boolean(item))
    .sort((a, b) => b.confidence - a.confidence)[0] ?? null;
}

function mapYouTubeStatus(status: number): SongSeedReferenceErrorCode {
  return status === 401 || status === 403 ? 'unauthorized' : 'network_error';
}

function searchUrl(request: YouTubeRequest, apiKey: string): URL {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('videoCategoryId', '10');
  url.searchParams.set('maxResults', '10');
  url.searchParams.set('q', [requestTitle(request), requestArtist(request), 'official'].filter(Boolean).join(' '));
  return url;
}

function videosUrl(videoIds: string[], apiKey: string): URL {
  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.set('key', apiKey);
  url.searchParams.set('part', 'snippet,contentDetails');
  url.searchParams.set('id', videoIds.join(','));
  return url;
}

export async function findYouTubeReference(
  request: YouTubeRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<YouTubeLookupResponse> {
  const apiKey = text(env.YOUTUBE_API_KEY);
  const title = requestTitle(request);
  if (!title) return {ok: false, code: 'empty_query', error: 'Select a song first.'};
  if (!apiKey) return {ok: false, code: 'missing_key', error: 'YOUTUBE_API_KEY is not set.'};
  try {
    const search = await withTimeout(fetchImpl(searchUrl(request, apiKey)), envTimeoutMs(env, 'YOUTUBE_TIMEOUT_MS', YOUTUBE_TIMEOUT_MS), 'YouTube lookup timed out.');
    if (!search.ok) return {ok: false, code: mapYouTubeStatus(search.status), error: `YouTube search returned ${search.status}.`};
    const searchItems = ((await search.json()) as {items?: YouTubeSearchItem[]}).items ?? [];
    const ids = searchItems.map(item => text(item.id?.videoId)).filter((item): item is string => Boolean(item));
    if (ids.length === 0) return {ok: false, code: 'not_found', error: 'No YouTube reference candidates were found.'};
    const details = await withTimeout(fetchImpl(videosUrl(ids, apiKey)), envTimeoutMs(env, 'YOUTUBE_TIMEOUT_MS', YOUTUBE_TIMEOUT_MS), 'YouTube video lookup timed out.');
    if (!details.ok) return {ok: false, code: mapYouTubeStatus(details.status), error: `YouTube video lookup returned ${details.status}.`};
    const videos = ((await details.json()) as {items?: YouTubeVideo[]}).items ?? [];
    const source = selectBestYouTubeReference(videos, request);
    return source
      ? {ok: true, source}
      : {ok: false, code: 'not_found', error: 'No reliable YouTube reference match was found.'};
  } catch (error) {
    const message = error instanceof Error ? error.message : 'YouTube reference lookup failed.';
    return {ok: false, code: message.toLowerCase().includes('timeout') ? 'timeout' : 'network_error', error: message};
  }
}
