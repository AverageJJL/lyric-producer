import type {SongSeedBpmKeyCandidate, SongSeedBpmKeyRequest} from './songSeedTypes';
import {envTimeoutMs, normalizeSongText, text, type FetchLike, withTimeout} from './songSeedUtils';

type WebSource = {title?: string; url: string};

type WebMetadataResult =
  | {ok: true; candidate: SongSeedBpmKeyCandidate}
  | {ok: false; error: string};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_WEB_METADATA_MODEL = 'openai/gpt-4o-mini-search-preview';
const OPENROUTER_WEB_TIMEOUT_MS = 9000;
const RAW_RESPONSE_LIMIT = 600;

function sourceList(value: unknown): WebSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(item => {
    const directUrl = text(item);
    if (directUrl) return [{url: directUrl}];
    if (!item || typeof item !== 'object') {
      return [];
    }
    const record = item as Record<string, unknown>;
    const url = text(record.url);
    return url ? [{url, title: text(record.title)}] : [];
  });
}

function annotationsSources(message: {annotations?: unknown}): WebSource[] {
  if (!Array.isArray(message.annotations)) {
    return [];
  }
  return message.annotations.flatMap(item => {
    const citation = (item as {url_citation?: Record<string, unknown>})?.url_citation;
    const url = text(citation?.url);
    return url ? [{url, title: text(citation?.title)}] : [];
  });
}

function firstObject(value: unknown, request: SongSeedBpmKeyRequest): Record<string, unknown> | null {
  if (Array.isArray(value)) {
    const match = value.find(item => item && typeof item === 'object' && matchesRequest(item as Record<string, unknown>, request));
    return match ? match as Record<string, unknown> : null;
  }
  return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}

function parseJsonValue(content: string): unknown | null {
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function fencedJsonContent(content: string): string | null {
  return content.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim() ?? null;
}

function jsonFromContent(content: string, request: SongSeedBpmKeyRequest): Record<string, unknown> | null {
  const direct = firstObject(parseJsonValue(content.trim()), request);
  if (direct) return direct;
  const fenced = fencedJsonContent(content);
  if (fenced) {
    const parsed = firstObject(parseJsonValue(fenced), request);
    if (parsed) return parsed;
  }
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    return firstObject(parsed, request);
  } catch {
    return null;
  }
}

function snippet(value: unknown): string {
  const content = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!content) {
    return 'empty response';
  }
  return content.length > RAW_RESPONSE_LIMIT
    ? `${content.slice(0, RAW_RESPONSE_LIMIT)}...`
    : content;
}

function bpmValue(value: unknown): number | undefined {
  const parsed = typeof value === 'number'
    ? value
    : Number(text(value)?.match(/\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : undefined;
}

function validKey(value: unknown): string | undefined {
  const key = text(value)
    ?.replace(/[♯]/g, '#')
    .replace(/[♭]/g, 'b')
    .replace(/\s*[- ]?\s*sharp\b/gi, '#')
    .replace(/\s*[- ]?\s*flat\b/gi, 'b')
    .replace(/\s+/g, ' ')
    .trim();
  const match = key?.match(/^([A-G])\s*(#|b)?\s+(major|minor)$/i);
  return match ? `${match[1].toUpperCase()}${match[2] ?? ''} ${match[3].toLowerCase()}` : undefined;
}

function containsSongText(haystack: string | undefined, needle: string | undefined): boolean {
  const normalizedHaystack = normalizeSongText(haystack);
  const normalizedNeedle = normalizeSongText(needle);
  return !normalizedNeedle || !normalizedHaystack || normalizedHaystack.includes(normalizedNeedle) || normalizedNeedle.includes(normalizedHaystack);
}

function matchesRequest(payload: Record<string, unknown>, request: SongSeedBpmKeyRequest): boolean {
  return containsSongText(text(payload.title), request.title) && containsSongText(text(payload.artist), request.artist);
}

function validationReasons(
  payload: Record<string, unknown>,
  annotationSources: WebSource[],
  request: SongSeedBpmKeyRequest,
): string[] {
  const bpm = bpmValue(payload.bpm);
  const key = validKey(payload.key);
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;
  const sources = [...sourceList(payload.sources), ...annotationSources];
  return [
    !bpm || bpm < 40 || bpm > 240 ? 'missing valid BPM' : undefined,
    !key ? 'missing valid key' : undefined,
    confidence < 0.6 ? 'confidence below 0.6' : undefined,
    sources.length === 0 ? 'missing source URL' : undefined,
    matchesRequest(payload, request) ? undefined : 'response did not match requested song',
  ].filter(Boolean) as string[];
}

function candidateFromWebJson(
  payload: Record<string, unknown>,
  request: SongSeedBpmKeyRequest,
  annotationSources: WebSource[],
): SongSeedBpmKeyCandidate | null {
  const bpm = bpmValue(payload.bpm);
  const key = validKey(payload.key);
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;
  const sources = [...sourceList(payload.sources), ...annotationSources]
    .filter((source, index, all) => all.findIndex(item => item.url === source.url) === index);
  // Web metadata is only a safety net for broken provider matches, so it must
  // be stricter than the model analysis path: no citations, no tempo/key.
  if (!bpm || bpm < 40 || bpm > 240 || !key || confidence < 0.6 || sources.length === 0 || !matchesRequest(payload, request)) {
    return null;
  }
  return {
    title: text(payload.title) ?? request.title ?? 'Unknown song',
    artist: text(payload.artist) ?? request.artist,
    bpm,
    key,
    source: 'openrouter-web',
    confidence: Math.min(0.94, Math.max(0.6, Number(confidence.toFixed(2)))),
    matchReason: 'OpenRouter web metadata fallback',
    sources,
  };
}

function requestBody(request: SongSeedBpmKeyRequest, model: string) {
  const song = [request.title, request.artist, request.album, request.releaseYear]
    .filter(Boolean)
    .join(' - ');
  return {
    model,
    temperature: 0,
    max_tokens: 900,
    stream: false,
    plugins: [{
      id: 'web',
      max_results: 8,
      search_prompt: [
        'Search public music metadata pages for the exact commercial recording.',
        'Prioritize pages that explicitly list tempo/BPM and musical key.',
        'Good sources include Tunebat, Musicstax, SongBPM, Chosic, GetSongBPM, and SongData-style metadata pages.',
      ].join(' '),
    }],
    messages: [
      {
        role: 'system',
        content: [
          'You are a music metadata lookup tool.',
          'Use web results only; do not infer BPM or key from lyrics, genre, memory, or audio analysis.',
          'Find the exact public BPM and musical key for the requested commercial recording.',
          'If sources disagree, choose the value supported by the strongest exact-match source and lower confidence.',
          'You can only return valid JSON.',
          'Do not include prose, Markdown, code fences, bullet points, arrays, explanations, or text before or after the JSON.',
          'Return exactly one JSON object with title, artist, bpm, key, confidence, sources.',
          'bpm must be a number. key must be formatted like "F major", "C# major", "Bb minor", or "A minor".',
          'sources must be the exact URLs used for the BPM/key answer.',
          'Example output: {"title":"Umbrella","artist":"Rihanna","bpm":87,"key":"Bb minor","confidence":0.92,"sources":[{"title":"Tunebat","url":"https://example.com/umbrella"}]}',
        ].join(' '),
      },
      {role: 'user', content: `Find BPM and musical key for: ${song}`},
    ],
  };
}

export async function lookupOpenRouterWebBpmKey(
  request: SongSeedBpmKeyRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<WebMetadataResult> {
  const apiKey = text(env.OPENROUTER_API_KEY);
  if (!apiKey) {
    return {ok: false, error: 'OPENROUTER_API_KEY is not set.'};
  }
  const model = text(env.OPENROUTER_WEB_MODEL) ?? DEFAULT_WEB_METADATA_MODEL;
  const baseUrl = text(env.AI_PRODUCER_API_BASE_URL) ?? DEFAULT_BASE_URL;
  try {
    const response = await withTimeout(fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'AI Producer Core'},
      body: JSON.stringify(requestBody(request, model)),
    }), envTimeoutMs(env, 'OPENROUTER_WEB_TIMEOUT_MS', OPENROUTER_WEB_TIMEOUT_MS), 'OpenRouter web timed out.');
    if (!response.ok) {
      return {ok: false, error: `OpenRouter web returned ${response.status}.`};
    }
    const message = ((await response.json()) as {choices?: Array<{message?: {content?: unknown; annotations?: unknown}}>})
      .choices?.[0]?.message;
    const content = String(message?.content ?? '');
    const payload = jsonFromContent(content, request);
    const candidate = payload ? candidateFromWebJson(payload, request, annotationsSources(message ?? {})) : null;
    if (candidate) {
      return {ok: true, candidate};
    }
    const reasons = payload ? validationReasons(payload, annotationsSources(message ?? {}), request).join(', ') : 'no matching JSON object';
    return {
      ok: false,
      error: `OpenRouter web metadata failed validation (${reasons}). Raw OpenRouter output: ${snippet(content)}`,
    };
  } catch (error) {
    return {ok: false, error: error instanceof Error ? error.message : 'OpenRouter web metadata lookup failed.'};
  }
}
