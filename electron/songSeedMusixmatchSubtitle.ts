import type {SongSeedSyncedLyricLine} from './songSeedTypes';
import {text, type FetchLike} from './songSeedUtils';

const LRC_TIMESTAMP = /\[(\d{1,2}:)?\d{1,2}:\d{2}(?:[.,]\d{1,3})?\]/g;

function numberLike(value: unknown): number | undefined {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) && number >= 0 ? number : undefined;
}

function secondsFromTimestamp(value: string): number | undefined {
  const parts = value.slice(1, -1).replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return undefined;
  const seconds = Number(parts.pop());
  const minutes = Number(parts.pop());
  const hours = parts.length ? Number(parts.pop()) : 0;
  if (![hours, minutes, seconds].every(Number.isFinite)) return undefined;
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanSubtitleText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

function withEndTimes(lines: SongSeedSyncedLyricLine[]): SongSeedSyncedLyricLine[] {
  const sorted = lines
    .filter(line => line.text && Number.isFinite(line.startSeconds))
    .sort((left, right) => left.startSeconds - right.startSeconds);
  return sorted.map((line, index) => {
    const explicitEnd = line.endSeconds && line.endSeconds > line.startSeconds ? line.endSeconds : undefined;
    const nextStart = sorted[index + 1]?.startSeconds;
    const endSeconds = explicitEnd ?? (nextStart && nextStart > line.startSeconds ? nextStart : undefined);
    return endSeconds ? {...line, endSeconds: Number(endSeconds.toFixed(3))} : line;
  });
}

function parseLrcBody(body: string): SongSeedSyncedLyricLine[] {
  const lines: SongSeedSyncedLyricLine[] = [];
  body.split(/\r?\n/).forEach(rawLine => {
    const matches = Array.from(rawLine.matchAll(LRC_TIMESTAMP));
    if (matches.length === 0) return;
    const lyricText = cleanSubtitleText(rawLine.replace(LRC_TIMESTAMP, ''));
    if (!lyricText || lyricText.startsWith('*******')) return;
    matches.forEach(match => {
      const startSeconds = secondsFromTimestamp(match[0]);
      if (startSeconds !== undefined) {
        lines.push({text: lyricText, startSeconds: Number(startSeconds.toFixed(3))});
      }
    });
  });
  return withEndTimes(lines);
}

function textFromJsonLine(value: Record<string, unknown>): string {
  const lyricText = text(value.text) || text(value.line) || text(value.lyric) || text(value.lyrics);
  if (lyricText) return lyricText;
  const richLine = value.l;
  return Array.isArray(richLine)
    ? richLine.map(part => text((part as Record<string, unknown>)?.c)).filter(Boolean).join('')
    : '';
}

function timeFromJsonLine(value: Record<string, unknown>, key: string): number | undefined {
  const direct = numberLike(value[key]);
  if (direct !== undefined) return direct;
  const timeValue = value.time;
  return timeValue && typeof timeValue === 'object'
    ? numberLike((timeValue as Record<string, unknown>)[key]) ?? numberLike((timeValue as Record<string, unknown>).total)
    : undefined;
}

function parseJsonBody(body: string): SongSeedSyncedLyricLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : Array.isArray((parsed as {lyrics?: unknown})?.lyrics)
    ? (parsed as {lyrics: unknown[]}).lyrics
    : [];
  const lines = items.flatMap(item => {
    if (!item || typeof item !== 'object') return [];
    const raw = item as Record<string, unknown>;
    const lyricText = cleanSubtitleText(textFromJsonLine(raw));
    const startSeconds = timeFromJsonLine(raw, 'startSeconds')
      ?? timeFromJsonLine(raw, 'start')
      ?? timeFromJsonLine(raw, 'ts');
    const endSeconds = timeFromJsonLine(raw, 'endSeconds')
      ?? timeFromJsonLine(raw, 'end')
      ?? timeFromJsonLine(raw, 'te');
    return lyricText && startSeconds !== undefined
      ? [{text: lyricText, startSeconds, ...(endSeconds !== undefined ? {endSeconds} : {})}]
      : [];
  });
  return withEndTimes(lines);
}

function subtitleBody(payload: unknown): string {
  const body = (payload as {message?: {body?: unknown}})?.message?.body;
  const subtitle = (body as {subtitle?: Record<string, unknown>})?.subtitle
    ?? (Array.isArray((body as {subtitle_list?: unknown})?.subtitle_list)
      ? ((body as {subtitle_list: Array<{subtitle?: Record<string, unknown>}>}).subtitle_list[0]?.subtitle)
      : undefined);
  return text(subtitle?.subtitle_body) ?? '';
}

export function parseMusixmatchSubtitlePayload(payload: unknown): SongSeedSyncedLyricLine[] {
  const body = subtitleBody(payload);
  if (!body) return [];
  const jsonLines = parseJsonBody(body);
  return jsonLines.length > 0 ? jsonLines : parseLrcBody(body);
}

export async function getMusixmatchSyncedLyrics(
  trackId: string,
  apiKey: string,
  fetchImpl: FetchLike,
): Promise<SongSeedSyncedLyricLine[]> {
  const url = new URL('https://api.musixmatch.com/ws/1.1/track.subtitle.get');
  url.searchParams.set('apikey', apiKey);
  url.searchParams.set('track_id', trackId);
  url.searchParams.set('subtitle_format', 'lrc');
  try {
    const response = await fetchImpl(url);
    if (!response.ok) return [];
    return parseMusixmatchSubtitlePayload(await response.json());
  } catch {
    return [];
  }
}
