import {DEFAULT_MODEL} from './copilotRequest';
import {knownPublicSongContext} from './songSeedMetadata';
import {
  buildProducerInsight,
  producerInsightFromUnknown,
  type ProducerInsight,
} from './songSeedProducerInsight';
import {
  buildFallbackSongSections,
  hasCompleteSongArc,
  mergeIntoFullSongSections,
} from './songSeedStructure';
import type {SongSeedBpmKeyCandidate, SongSeedTrack} from './songSeedTypes';
import {envTimeoutMs, text, type FetchLike, withTimeout} from './songSeedUtils';

type ScaleMetadata = {root: string; mode: string};

export type SongSeedAnalyzeRequest = {
  track?: SongSeedTrack;
  lyrics?: string;
  bpmKeyCandidates?: SongSeedBpmKeyCandidate[];
  publicContext?: string;
};

export type SongSeedAnalyzedSection = {
  id: string;
  name: string;
  bars: number;
  lyricRange: {startLine: number; endLine: number};
  lyrics: string[];
  mood: string;
  meaning: string;
  productionDrivers: string[];
  productionCue: string;
  producerInsight?: ProducerInsight;
  confidence: number;
};

export type SongSeedAnalysis = {
  title: string;
  bpm: number;
  scale: ScaleMetadata;
  keySource: string;
  bpmKey: {source: string; confidence: number; note?: string};
  sections: SongSeedAnalyzedSection[];
};

export type SongSeedAnalyzeResponse =
  | {ok: true; source: 'openrouter' | 'fallback'; analysis: SongSeedAnalysis; warning?: string}
  | {ok: false; error: string};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENROUTER_ANALYSIS_TIMEOUT_MS = 2800;
const ROOTS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function lyricLines(value: string | undefined): string[] {
  return (value ?? '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('*******'));
}

function hashText(value: string): number {
  return Array.from(value).reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) >>> 0, 7);
}

function scaleFromKey(value: string | undefined, fallback: ScaleMetadata): ScaleMetadata {
  const root = value?.match(/[A-G](?:#|b)?/)?.[0];
  if (!root) {
    return fallback;
  }
  return {root, mode: /min|minor|m\b/i.test(value) ? 'minor' : 'major'};
}

function fallbackMetadata(request: SongSeedAnalyzeRequest) {
  const best = (request.bpmKeyCandidates ?? []).slice().sort((a, b) => b.confidence - a.confidence)[0];
  const publicContext = request.track ? knownPublicSongContext({
    title: request.track.title,
    artist: request.track.artist,
    album: request.track.album,
    releaseYear: request.track.releaseYear,
  }) : null;
  const seed = `${request.track?.title ?? ''} ${request.track?.artist ?? ''}`.toLowerCase();
  const hash = hashText(seed);
  const fallbackScale = {root: ROOTS[hash % ROOTS.length], mode: hash % 3 === 0 ? 'minor' : 'major'};
  return {
    bpm: best?.bpm ?? publicContext?.bpm ?? 84 + (hash % 54),
    scale: scaleFromKey(best?.key ?? publicContext?.key, fallbackScale),
    source: best?.source ?? (publicContext ? 'public-context' : 'local-estimate'),
    confidence: best?.confidence ?? publicContext?.confidence ?? 0.34,
    note: best?.matchReason ?? publicContext?.note,
  };
}

function numericRange(section: Record<string, unknown>) {
  const range = section.lyricRange as Record<string, unknown> | undefined;
  const start = Number(section.startLine ?? range?.startLine);
  const end = Number(section.endLine ?? range?.endLine);
  return Number.isInteger(start) && Number.isInteger(end) ? {startLine: start, endLine: end} : null;
}

export function validateSongSeedModelSections(
  value: unknown,
  lines: string[],
  publicContext?: string,
): SongSeedAnalyzedSection[] | null {
  const raw = Array.isArray(value)
    ? value
    : (value as {sections?: unknown[]})?.sections;
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }
  const used = new Set<number>();
  const sections: SongSeedAnalyzedSection[] = [];
  for (const [index, item] of raw.entries()) {
    if (!item || typeof item !== 'object') {
      return null;
    }
    const section = item as Record<string, unknown>;
    const range = numericRange(section);
    const name = cleanString(section.name ?? section.sectionName);
    const mood = cleanString(section.mood);
    const meaning = cleanString(section.meaning);
    const productionDrivers = Array.isArray(section.productionDrivers)
      ? section.productionDrivers.map(cleanString).filter(Boolean) as string[]
      : [];
    if (!range || !name || !mood || !meaning || productionDrivers.length === 0) {
      return null;
    }
    if (range.startLine < 0 || range.endLine < range.startLine || range.endLine >= lines.length) {
      return null;
    }
    for (let line = range.startLine; line <= range.endLine; line += 1) {
      if (used.has(line)) {
        return null;
      }
      used.add(line);
    }
    const bars = Math.max(2, Math.min(16, Math.round(Number(section.bars) || 4)));
    const lyrics = lines.slice(range.startLine, range.endLine + 1);
    const producerInsight = producerInsightFromUnknown(
      section.producerInsight,
      buildProducerInsight({
        sectionName: name,
        lyrics,
        hook: /chorus/i.test(name),
        publicContext,
      }),
    );
    sections.push({
      id: `song-idea-${index}`,
      name,
      bars,
      lyricRange: range,
      lyrics,
      mood,
      meaning,
      productionDrivers,
      productionCue: cleanString(section.productionCue) ?? productionDrivers.join(', '),
      producerInsight,
      confidence: Math.max(0, Math.min(1, Number(section.confidence) || 0.7)),
    });
  }
  return sections;
}

function extractJson(content: string): unknown {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('No JSON object found.');
  }
  return JSON.parse(content.slice(start, end + 1));
}

function requestBody(request: SongSeedAnalyzeRequest, lines: string[], model: string) {
  const metadata = fallbackMetadata(request);
  const publicContext = request.track ? knownPublicSongContext({
    title: request.track.title,
    artist: request.track.artist,
  }) : null;
  return {
    model,
    temperature: 0.2,
    max_tokens: 1800,
    stream: false,
    messages: [
      {
        role: 'system',
        content: [
          'Analyze song lyrics for a DAW arrangement.',
          'Return JSON only: {"sections":[...]}',
          'Prefer a full pop structure with intro, repeated verses, pre-choruses, choruses, bridge, final chorus, and outro.',
          'Each section needs name, zero-based startLine, endLine, bars, mood, meaning, productionDrivers, productionCue, confidence.',
          'Also include producerInsight with intent, arrangementMove, vocalTreatment, soundPalette, mixFocus, and risk.',
          'Make producerInsight concrete for a producer working in a DAW; avoid generic advice.',
          'Do not include API keys, audio paths, labels per lyric line, Markdown, or prose outside JSON.',
        ].join(' '),
      },
      {
        role: 'user',
        content: JSON.stringify({
          track: request.track,
          bpmKey: metadata,
          publicContext: request.publicContext ?? publicContext?.productionContext,
          lyricLines: lines.map((line, index) => ({index, line})),
        }),
      },
    ],
  };
}

export async function analyzeSongSeed(
  request: SongSeedAnalyzeRequest,
  env = process.env,
  fetchImpl: FetchLike = fetch,
): Promise<SongSeedAnalyzeResponse> {
  if (!request.track) {
    return {ok: false, error: 'Select a song first.'};
  }
  const lines = lyricLines(request.lyrics);
  const metadata = fallbackMetadata(request);
  const publicContext = request.track ? knownPublicSongContext({
    title: request.track.title,
    artist: request.track.artist,
  }) : null;
  const title = [request.track.title, request.track.artist].filter(Boolean).join(' - ');
  const fallback = (): SongSeedAnalysis => ({
    title,
    bpm: metadata.bpm,
    scale: metadata.scale,
    keySource: `${metadata.source} (${Math.round(metadata.confidence * 100)}% confidence)`,
    bpmKey: {source: metadata.source, confidence: metadata.confidence, note: metadata.note},
    sections: buildFallbackSongSections(request, lines),
  });
  const apiKey = text(env.OPENROUTER_API_KEY);
  if (!apiKey || lines.length === 0) {
    return {ok: true, source: 'fallback', analysis: fallback(), warning: 'OpenRouter analysis was unavailable.'};
  }
  const model = text(env.AI_PRODUCER_MODEL) ?? DEFAULT_MODEL;
  const baseUrl = text(env.AI_PRODUCER_API_BASE_URL) ?? DEFAULT_BASE_URL;
  try {
    const response = await withTimeout(fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'AI Producer Core'},
      body: JSON.stringify(requestBody(request, lines, model)),
    }), envTimeoutMs(env, 'OPENROUTER_ANALYSIS_TIMEOUT_MS', OPENROUTER_ANALYSIS_TIMEOUT_MS), 'OpenRouter analysis timed out.');
    if (!response.ok) {
      return {ok: true, source: 'fallback', analysis: fallback(), warning: `OpenRouter returned ${response.status}.`};
    }
    const content = ((await response.json()) as {choices?: Array<{message?: {content?: unknown}}>})
      .choices?.[0]?.message?.content;
    const sections = validateSongSeedModelSections(
      extractJson(String(content ?? '')),
      lines,
      request.publicContext ?? publicContext?.productionContext,
    );
    if (!sections) {
      return {ok: true, source: 'fallback', analysis: fallback(), warning: 'Model analysis failed validation.'};
    }
    if (!hasCompleteSongArc(sections)) {
      return {
        ok: true,
        source: 'openrouter',
        analysis: {...fallback(), sections: mergeIntoFullSongSections(fallback().sections, sections)},
        warning: 'Model returned too few sections; expanded to a full song structure.',
      };
    }
    return {ok: true, source: 'openrouter', analysis: {...fallback(), sections}};
  } catch {
    return {ok: true, source: 'fallback', analysis: fallback(), warning: 'OpenRouter analysis failed.'};
  }
}
