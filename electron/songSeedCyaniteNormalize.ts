import type {SongSeedReferenceAnalysis, SongSeedReferenceSegment} from './songSeedTypes';

const MOOD_KEYS = [
  'aggressive',
  'calm',
  'chilled',
  'dark',
  'energetic',
  'epic',
  'happy',
  'romantic',
  'sad',
  'scary',
  'sexy',
  'ethereal',
  'uplifting',
];

const PRESENCE_SCORE: Record<string, number> = {
  absent: 0,
  partially: 0.35,
  partial: 0.35,
  frequently: 0.7,
  frequent: 0.7,
  throughout: 1,
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    : [];
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function enumText(value: unknown): string | undefined {
  return stringValue(value)?.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function scoreEntries(value: unknown): Array<{label: string; score: number}> {
  return Object.entries(record(value))
    .flatMap(([label, score]) => {
      const numeric = numberValue(score);
      return numeric === undefined ? [] : [{label, score: numeric}];
    })
    .sort((a, b) => b.score - a.score);
}

function scoreMap(value: unknown): Record<string, number> {
  return Object.fromEntries(scoreEntries(value).map(item => [item.label, item.score]));
}

function presenceScoreEntries(value: unknown): Array<{label: string; score: number}> {
  return Object.entries(record(value)).flatMap(([label, raw]) => {
    const numeric = numberValue(raw);
    const score = numeric ?? PRESENCE_SCORE[enumText(raw) ?? ''];
    return score === undefined ? [] : [{label, score}];
  }).sort((a, b) => b.score - a.score);
}

function presenceScoreMap(value: unknown): Record<string, number> {
  return Object.fromEntries(presenceScoreEntries(value).map(item => [item.label, item.score]));
}

function firstStrings(...values: unknown[]): string[] {
  const seen = new Set<string>();
  return values.flatMap(value => stringArray(value))
    .map(item => item.trim())
    .filter(item => {
      const key = item.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function scoreAt(value: unknown, key: string, index: number): number | undefined {
  const scores = record(value)[key];
  return Array.isArray(scores) ? numberValue(scores[index]) : undefined;
}

function topSegmentScore(value: unknown, index: number, fallbackLabels?: string[]) {
  const labels = fallbackLabels ?? Object.keys(record(value));
  return labels
    .map(label => ({label, score: scoreAt(value, label, index) ?? 0}))
    .sort((a, b) => b.score - a.score)[0];
}

function normalizeSegments(rawSegments: unknown): SongSeedReferenceSegment[] {
  const segments = record(rawSegments);
  const timestamps = Array.isArray(segments.timestamps) ? segments.timestamps : [];
  return timestamps.flatMap((timestamp, index) => {
    const numericTimestamp = numberValue(timestamp);
    if (numericTimestamp === undefined) {
      return [];
    }
    const topMood = topSegmentScore(segments.mood, index, MOOD_KEYS);
    const topGenre = topSegmentScore(segments.advancedGenre, index);
    const topInstrument = topSegmentScore(segments.advancedInstrumentsExtended, index)
      ?? topSegmentScore(segments.advancedInstruments, index);
    const topVoice = topSegmentScore(segments.voice, index);
    const valence = Array.isArray(segments.valence) ? numberValue(segments.valence[index]) : undefined;
    const arousal = Array.isArray(segments.arousal) ? numberValue(segments.arousal[index]) : undefined;
    return [{
      timestamp: numericTimestamp,
      mood: topMood?.label,
      moodScore: topMood?.score,
      valence,
      arousal,
      genre: topGenre?.label,
      genreScore: topGenre?.score,
      instrument: topInstrument?.label,
      instrumentScore: topInstrument?.score,
      voice: topVoice?.label,
      voiceScore: topVoice?.score,
    }];
  });
}

function curveSeries(rawSegments: unknown, key: string, timestamps: number[]) {
  return Object.entries(record(record(rawSegments)[key])).flatMap(([label, values]) => {
    if (!Array.isArray(values)) return [];
    const points = values.flatMap((value, index) => {
      const score = numberValue(value);
      const timestamp = timestamps[index];
      return score === undefined || timestamp === undefined ? [] : [{timestamp, value: score}];
    });
    return points.length > 0 ? [{label, points}] : [];
  });
}

function normalizeCurves(rawSegments: unknown): SongSeedReferenceAnalysis['curves'] {
  const rawTimestamps = record(rawSegments).timestamps;
  const timestamps = (Array.isArray(rawTimestamps) ? rawTimestamps : [])
    .map(numberValue)
    .filter((item: number | undefined): item is number => item !== undefined);
  if (timestamps.length === 0) return undefined;
  return {
    mood: curveSeries(rawSegments, 'mood', timestamps),
    advancedGenre: curveSeries(rawSegments, 'advancedGenre', timestamps),
    advancedSubgenre: curveSeries(rawSegments, 'advancedSubgenre', timestamps),
    instruments: curveSeries(rawSegments, 'advancedInstruments', timestamps),
    instrumentsExtended: curveSeries(rawSegments, 'advancedInstrumentsExtended', timestamps),
    voice: curveSeries(rawSegments, 'voice', timestamps),
  };
}

function freeGenres(value: unknown): string[] {
  const raw = stringValue(value);
  return raw ? raw.split(/[,;]+/).map(item => item.trim()).filter(Boolean) : [];
}

function firstAvailableKey(raw: Record<string, unknown>): string | undefined {
  const prediction = record(raw.keyPrediction);
  return stringValue(prediction.value)
    ?? stringValue(prediction.key)
    ?? stringValue(raw.key)
    ?? stringValue(raw.keyPrediction);
}

export function normalizeCyaniteAnalysis(
  track: Record<string, unknown>,
): SongSeedReferenceAnalysis | null {
  const audio = record(track.audioAnalysisV7);
  if (audio.__typename !== 'AudioAnalysisV7Finished') {
    return null;
  }
  const result = record(audio.result);
  const moodScores = scoreEntries(result.mood);
  const topMoods = moodScores
    .filter(item => item.score >= 0.1)
    .slice(0, 3)
    .map(item => item.label);
  const libraryTrackId = stringValue(track.id);
  if (!libraryTrackId) {
    return null;
  }
  return {
    provider: 'cyanite',
    libraryTrackId,
    title: stringValue(track.title),
    caption: stringValue(result.transformerCaption),
    bpm: numberValue(result.bpmRangeAdjusted),
    key: firstAvailableKey(result),
    timeSignature: stringValue(result.timeSignature),
    valence: numberValue(result.valence),
    arousal: numberValue(result.arousal),
    energyLevel: enumText(result.energyLevel),
    energyDynamics: enumText(result.energyDynamics),
    emotionalProfile: enumText(result.emotionalProfile),
    emotionalDynamics: enumText(result.emotionalDynamics),
    moodTags: firstStrings(result.moodTags, topMoods),
    moodAdvancedTags: firstStrings(result.moodAdvancedTags),
    movementTags: firstStrings(result.movementTags),
    characterTags: firstStrings(result.characterTags),
    genreTags: firstStrings(result.advancedGenreTags, result.genreTags, freeGenres(result.freeGenreTags)),
    subgenreTags: firstStrings(result.advancedSubgenreTags, result.subgenreTags),
    instrumentTags: firstStrings(result.advancedInstrumentTagsExtended, result.advancedInstrumentTags, result.instrumentTags),
    voiceTags: firstStrings(result.voiceTags, result.predominantVoiceGender, result.voicePresenceProfile),
    freeGenreTags: freeGenres(result.freeGenreTags),
    voiceoverDegree: numberValue(result.voiceoverDegree),
    voiceoverExists: booleanValue(result.voiceoverExists),
    scoreMaps: {
      mood: scoreMap(result.mood),
      advancedGenre: scoreMap(result.advancedGenre),
      advancedSubgenre: scoreMap(result.advancedSubgenre),
      instruments: presenceScoreMap(result.advancedInstrumentPresence),
      instrumentsExtended: presenceScoreMap(result.advancedInstrumentPresenceExtended),
      voice: scoreMap(result.voice),
    },
    curves: normalizeCurves(result.segments),
    segments: normalizeSegments(result.segments),
  };
}

export function cyaniteAnalysisStatus(track: Record<string, unknown>):
  | {status: 'finished'; analysis: SongSeedReferenceAnalysis}
  | {status: 'failed'; error: string}
  | {status: 'processing'} {
  const audio = record(track.audioAnalysisV7);
  if (audio.__typename === 'AudioAnalysisV7Finished') {
    const analysis = normalizeCyaniteAnalysis(track);
    return analysis
      ? {status: 'finished', analysis}
      : {status: 'failed', error: 'Cyanite returned an incomplete analysis payload.'};
  }
  if (audio.__typename === 'AudioAnalysisV7Failed') {
    return {status: 'failed', error: stringValue(record(audio.error).message) ?? 'Cyanite analysis failed.'};
  }
  if (audio.__typename === 'AudioAnalysisV7NotAuthorized') {
    return {status: 'failed', error: 'Cyanite analysis is not authorized for this account.'};
  }
  return {status: 'processing'};
}
