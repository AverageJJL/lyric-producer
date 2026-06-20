export type ReferenceMoodSegment = {
  timestamp: number;
  mood?: string;
  moodScore?: number;
  valence?: number;
  arousal?: number;
  genre?: string;
  genreScore?: number;
  instrument?: string;
  instrumentScore?: number;
  voice?: string;
  voiceScore?: number;
};

export type ReferenceMoodSource = {
  kind: 'youtube';
  url: string;
  videoId: string;
  title: string;
  channelTitle: string;
  confidence: number;
  matchReason?: string;
};

export type ReferenceMoodAnalysis = {
  provider: 'cyanite';
  libraryTrackId: string;
  source?: ReferenceMoodSource;
  cacheStatus?: 'cache' | 'library' | 'analyzed';
  title?: string;
  caption?: string;
  bpm?: number;
  key?: string;
  timeSignature?: string;
  valence?: number;
  arousal?: number;
  energyLevel?: string;
  energyDynamics?: string;
  emotionalProfile?: string;
  emotionalDynamics?: string;
  moodTags: string[];
  moodAdvancedTags: string[];
  movementTags: string[];
  characterTags: string[];
  genreTags: string[];
  subgenreTags: string[];
  instrumentTags: string[];
  voiceTags: string[];
  freeGenreTags: string[];
  voiceoverDegree?: number;
  voiceoverExists?: boolean;
  waveformUrl?: string;
  scoreMaps?: Record<string, Record<string, number>>;
  curves?: Record<string, Array<{label: string; points: Array<{timestamp: number; value: number}>}>>;
  segments: ReferenceMoodSegment[];
};

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function normalizeSegment(value: unknown): ReferenceMoodSegment | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const timestamp = numberOrUndefined(raw.timestamp);
  if (timestamp === undefined || timestamp < 0) {
    return null;
  }
  return {
    timestamp,
    mood: stringOrUndefined(raw.mood),
    moodScore: numberOrUndefined(raw.moodScore),
    valence: numberOrUndefined(raw.valence),
    arousal: numberOrUndefined(raw.arousal),
    genre: stringOrUndefined(raw.genre),
    genreScore: numberOrUndefined(raw.genreScore),
    instrument: stringOrUndefined(raw.instrument),
    instrumentScore: numberOrUndefined(raw.instrumentScore),
    voice: stringOrUndefined(raw.voice),
    voiceScore: numberOrUndefined(raw.voiceScore),
  };
}

function scoreMap(value: unknown): Record<string, number> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .flatMap(([label, score]) => {
      const numeric = numberOrUndefined(score);
      return numeric === undefined ? [] : [[label, numeric] as const];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function scoreMaps(value: unknown): ReferenceMoodAnalysis['scoreMaps'] {
  if (!value || typeof value !== 'object') return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .flatMap(([label, map]) => {
      const normalized = scoreMap(map);
      return normalized ? [[label, normalized] as const] : [];
    });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function curves(value: unknown): ReferenceMoodAnalysis['curves'] {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const entries = Object.entries(raw).flatMap(([group, series]) => {
    if (!Array.isArray(series)) return [];
    const normalized = series.map(item => {
      const source = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const label = stringOrUndefined(source.label);
      const points = Array.isArray(source.points)
        ? source.points.map(point => {
          const rawPoint = point && typeof point === 'object' ? point as Record<string, unknown> : {};
          const timestamp = numberOrUndefined(rawPoint.timestamp);
          const value = numberOrUndefined(rawPoint.value);
          return timestamp === undefined || value === undefined ? null : {timestamp, value};
        }).filter((point): point is {timestamp: number; value: number} => Boolean(point))
        : [];
      return label && points.length > 0 ? {label, points} : null;
    }).filter((item): item is {label: string; points: Array<{timestamp: number; value: number}>} => Boolean(item));
    return normalized.length > 0 ? [[group, normalized] as const] : [];
  });
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeSource(value: unknown): ReferenceMoodSource | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const url = stringOrUndefined(raw.url);
  const videoId = stringOrUndefined(raw.videoId);
  const title = stringOrUndefined(raw.title);
  const channelTitle = stringOrUndefined(raw.channelTitle);
  const confidence = numberOrUndefined(raw.confidence);
  if (raw.kind !== 'youtube' || !url || !videoId || !title || !channelTitle || confidence === undefined) {
    return undefined;
  }
  return {
    kind: 'youtube',
    url,
    videoId,
    title,
    channelTitle,
    confidence,
    matchReason: stringOrUndefined(raw.matchReason),
  };
}

export function normalizeReferenceMoodAnalysis(value: unknown): ReferenceMoodAnalysis | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const raw = value as Record<string, unknown>;
  const libraryTrackId = stringOrUndefined(raw.libraryTrackId);
  if (raw.provider !== 'cyanite' || !libraryTrackId) {
    return undefined;
  }
  return {
    provider: 'cyanite',
    libraryTrackId,
    source: normalizeSource(raw.source),
    cacheStatus: raw.cacheStatus === 'cache' || raw.cacheStatus === 'library' || raw.cacheStatus === 'analyzed' ? raw.cacheStatus : undefined,
    title: stringOrUndefined(raw.title),
    caption: stringOrUndefined(raw.caption),
    bpm: numberOrUndefined(raw.bpm),
    key: stringOrUndefined(raw.key),
    timeSignature: stringOrUndefined(raw.timeSignature),
    valence: numberOrUndefined(raw.valence),
    arousal: numberOrUndefined(raw.arousal),
    energyLevel: stringOrUndefined(raw.energyLevel),
    energyDynamics: stringOrUndefined(raw.energyDynamics),
    emotionalProfile: stringOrUndefined(raw.emotionalProfile),
    emotionalDynamics: stringOrUndefined(raw.emotionalDynamics),
    moodTags: stringArray(raw.moodTags),
    moodAdvancedTags: stringArray(raw.moodAdvancedTags),
    movementTags: stringArray(raw.movementTags),
    characterTags: stringArray(raw.characterTags),
    genreTags: stringArray(raw.genreTags),
    subgenreTags: stringArray(raw.subgenreTags),
    instrumentTags: stringArray(raw.instrumentTags),
    voiceTags: stringArray(raw.voiceTags),
    freeGenreTags: stringArray(raw.freeGenreTags),
    voiceoverDegree: numberOrUndefined(raw.voiceoverDegree),
    voiceoverExists: typeof raw.voiceoverExists === 'boolean' ? raw.voiceoverExists : undefined,
    waveformUrl: stringOrUndefined(raw.waveformUrl),
    scoreMaps: scoreMaps(raw.scoreMaps),
    curves: curves(raw.curves),
    segments: Array.isArray(raw.segments)
      ? raw.segments.map(normalizeSegment).filter((item): item is ReferenceMoodSegment => Boolean(item))
      : [],
  };
}

export function cloneReferenceMoodAnalysis(
  value: ReferenceMoodAnalysis,
): ReferenceMoodAnalysis {
  return {
    ...value,
    source: value.source ? {...value.source} : undefined,
    moodTags: [...value.moodTags],
    moodAdvancedTags: [...value.moodAdvancedTags],
    movementTags: [...value.movementTags],
    characterTags: [...value.characterTags],
    genreTags: [...value.genreTags],
    subgenreTags: [...value.subgenreTags],
    instrumentTags: [...value.instrumentTags],
    voiceTags: [...(value.voiceTags ?? [])],
    freeGenreTags: [...(value.freeGenreTags ?? [])],
    scoreMaps: value.scoreMaps ? JSON.parse(JSON.stringify(value.scoreMaps)) as ReferenceMoodAnalysis['scoreMaps'] : undefined,
    curves: value.curves ? JSON.parse(JSON.stringify(value.curves)) as ReferenceMoodAnalysis['curves'] : undefined,
    segments: value.segments.map(segment => ({...segment})),
  };
}
