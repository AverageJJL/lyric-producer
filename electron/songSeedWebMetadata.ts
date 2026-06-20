import {DEFAULT_MODEL} from './copilotRequest';
import type {SongSeedBpmKeyCandidate, SongSeedBpmKeyRequest} from './songSeedTypes';
import {envTimeoutMs, numberValue, text, type FetchLike, withTimeout} from './songSeedUtils';

type WebSource = {title?: string; url: string};

type WebMetadataResult =
  | {ok: true; candidate: SongSeedBpmKeyCandidate}
  | {ok: false; error: string};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_WEB_TIMEOUT_MS = 2500;

function sourceList(value: unknown): WebSource[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap(item => {
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

function jsonFromContent(content: string): Record<string, unknown> | null {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) {
    return null;
  }
  try {
    const parsed = JSON.parse(content.slice(start, end + 1));
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function validKey(value: unknown): string | undefined {
  const key = text(value);
  return key && /^[A-G](?:#|b)?\s+(?:major|minor)$/i.test(key) ? key : undefined;
}

function candidateFromWebJson(
  payload: Record<string, unknown>,
  request: SongSeedBpmKeyRequest,
  annotationSources: WebSource[],
): SongSeedBpmKeyCandidate | null {
  const bpm = numberValue(payload.bpm);
  const key = validKey(payload.key);
  const confidence = typeof payload.confidence === 'number' ? payload.confidence : 0;
  const sources = [...sourceList(payload.sources), ...annotationSources]
    .filter((source, index, all) => all.findIndex(item => item.url === source.url) === index);
  // Web metadata is only a safety net for broken provider matches, so it must
  // be stricter than the model analysis path: no citations, no tempo/key.
  if (!bpm || bpm < 40 || bpm > 240 || !key || confidence < 0.6 || sources.length === 0) {
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
    max_tokens: 700,
    stream: false,
    plugins: [{id: 'web', max_results: 4}],
    messages: [
      {
        role: 'system',
        content: [
          'Find reliable public metadata for a song.',
          'Return JSON only with title, artist, bpm, key, confidence, sources.',
          'Key must be formatted like "F major" or "A minor".',
          'Sources must be URLs used for the BPM/key answer.',
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
  const model = text(env.AI_PRODUCER_MODEL) ?? DEFAULT_MODEL;
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
    const payload = jsonFromContent(String(message?.content ?? ''));
    const candidate = payload ? candidateFromWebJson(payload, request, annotationsSources(message ?? {})) : null;
    return candidate ? {ok: true, candidate} : {ok: false, error: 'OpenRouter web metadata failed validation.'};
  } catch {
    return {ok: false, error: 'OpenRouter web metadata lookup failed.'};
  }
}
