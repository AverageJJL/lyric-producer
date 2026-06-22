import type {ReferenceMoodAnalysis} from '../store/referenceMoodAnalysis';

export type SongSeedTrack = {
  id: string;
  title: string;
  artist?: string;
  album?: string;
  albumId?: string;
  albumCoverUrl?: string;
  artworkSource?: 'musixmatch' | 'itunes';
  releaseYear?: string;
  isrc?: string;
  commontrackId?: string;
  hasLyrics: boolean;
  hasTrackStructure?: boolean;
  source: 'musixmatch';
};

type ProviderErrorCode =
  | 'missing_key'
  | 'empty_query'
  | 'not_found'
  | 'network_error'
  | 'unauthorized';

type SongSeedReferenceErrorCode =
  | ProviderErrorCode
  | 'analysis_failed'
  | 'invalid_file'
  | 'limit_exceeded'
  | 'rate_limited'
  | 'timeout';

export type SongSeedReferenceCacheStatus = 'cache' | 'library' | 'analyzed';

export type SongSeedSearchResponse =
  | {ok: true; tracks: SongSeedTrack[]}
  | {ok: false; code: ProviderErrorCode; error: string};

export type SongSeedLyricsResponse =
  | {
      ok: true;
      trackId: string;
      lyrics: string;
      copyright?: string;
      structure?: SongSeedLyricStructure;
      structureSource?: 'catalog-feed' | 'unavailable';
      structureUnavailableReason?: string;
      syncedLyrics?: SongSeedSyncedLyricLine[];
      syncedLyricsSource?: 'musixmatch-subtitle';
    }
  | {ok: false; code: ProviderErrorCode | 'no_lyrics'; error: string};

export type SongSeedLyricStructureRole =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'hook'
  | 'bridge'
  | 'outro';

export type SongSeedLyricStructure = Partial<Record<SongSeedLyricStructureRole, number[]>>;

export type SongSeedSyncedLyricLine = {
  text: string;
  startSeconds: number;
  endSeconds?: number;
};

export type SongSeedLyricsSimilarityReport = {
  checkedAt: string;
  risk: 'low' | 'medium' | 'high' | 'unavailable';
  matches: Array<{
    candidateId: string;
    title: string;
    artist?: string;
    score: number;
    rhymeScore?: number;
    longestOverlap: string;
    matchedEndWords?: string[];
    matchedLineIds: string[];
    rhymeMatchedLineIds?: string[];
  }>;
  note?: string;
};

export type SongSeedLyricsSimilarityResponse =
  | {ok: true; report: SongSeedLyricsSimilarityReport}
  | {ok: false; code: ProviderErrorCode; error: string};

export type LyricSectionSource = 'musixmatch-structure' | 'lyric-headers' | 'repetition' | 'model' | 'fallback-template';

export type SongSeedBpmKeyResponse =
  | {
      ok: true;
      title: string;
      artist?: string;
      bpm?: number;
      key?: string;
      source: 'getsongbpm' | 'public-context' | 'openrouter-web';
      confidence: number;
      candidates: SongSeedBpmKeyCandidate[];
      note?: string;
    }
  | {ok: false; code: ProviderErrorCode; error: string};

export type SongSeedBpmKeyCandidate = {
  title: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
  bpm?: number;
  key?: string;
  source: 'getsongbpm' | 'public-context' | 'openrouter-web';
  confidence: number;
  matchReason: string;
  sources?: Array<{title?: string; url: string}>;
};

export type SongSeedReferenceAnalyzeResponse =
  | {ok: true; analysis: ReferenceMoodAnalysis; cacheStatus?: SongSeedReferenceCacheStatus}
  | {ok: false; code: SongSeedReferenceErrorCode; error: string; source?: ReferenceMoodAnalysis['source']};

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
  producerInsight?: {
    intent: string;
    arrangementMove: string;
    vocalTreatment: string;
    soundPalette: string;
    mixFocus: string;
    risk: string;
  };
  confidence: number;
  sectionSource?: LyricSectionSource;
  sectionConfidence?: number;
};

export type SongSeedAnalysisResponse =
  | {
      ok: true;
      source: 'openrouter' | 'fallback';
      analysis: {
        title: string;
        bpm: number;
        scale: {root: string; mode: string};
        keySource: string;
        bpmKey: {source: string; confidence: number; note?: string};
        sections: SongSeedAnalyzedSection[];
      };
      warning?: string;
    }
  | {ok: false; error: string};

export type SongSeedBridge = {
  search: (request: {query?: string; limit?: number}) => Promise<SongSeedSearchResponse>;
  getLyrics: (request: {
    trackId?: string;
    trackIsrc?: string;
    commontrackId?: string;
    hasTrackStructure?: boolean;
  }) => Promise<SongSeedLyricsResponse>;
  checkLyricsSimilarity: (request: {
    lyrics?: string;
    lineIds?: string[];
  }) => Promise<SongSeedLyricsSimilarityResponse>;
  lookupBpmKey: (request: {title?: string; artist?: string}) => Promise<SongSeedBpmKeyResponse>;
  analyze: (request: {
    track?: SongSeedTrack;
    lyrics?: string;
    lyricStructure?: SongSeedLyricStructure;
    bpmKeyCandidates?: SongSeedBpmKeyCandidate[];
    publicContext?: string;
  }) => Promise<SongSeedAnalysisResponse>;
  analyzeReference: (request: {
    track?: SongSeedTrack;
    title?: string;
    artist?: string;
    album?: string;
    releaseYear?: string;
    allowCreditSpend?: boolean;
  }) => Promise<SongSeedReferenceAnalyzeResponse>;
};

declare global {
  interface Window {
    songSeed?: SongSeedBridge;
  }
}

export function searchSongSeed(query: string, limit = 8): Promise<SongSeedSearchResponse | null> {
  return globalThis.window?.songSeed?.search({query, limit}) ?? Promise.resolve(null);
}

export function getSongSeedLyrics(track: SongSeedTrack | string): Promise<SongSeedLyricsResponse | null> {
  const request = typeof track === 'string'
    ? {trackId: track}
    : {
        trackId: track.id,
        trackIsrc: track.isrc,
        commontrackId: track.commontrackId,
        hasTrackStructure: track.hasTrackStructure,
      };
  return globalThis.window?.songSeed?.getLyrics(request) ?? Promise.resolve(null);
}

export function checkSongSeedLyricsSimilarity(input: {
  lyrics?: string;
  lineIds?: string[];
}): Promise<SongSeedLyricsSimilarityResponse | null> {
  return globalThis.window?.songSeed?.checkLyricsSimilarity(input) ?? Promise.resolve(null);
}

export function lookupSongSeedBpmKey(input: {
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
}): Promise<SongSeedBpmKeyResponse | null> {
  return globalThis.window?.songSeed?.lookupBpmKey(input) ?? Promise.resolve(null);
}

export function analyzeSongSeed(input: {
  track?: SongSeedTrack;
  lyrics?: string;
  lyricStructure?: SongSeedLyricStructure;
  bpmKeyCandidates?: SongSeedBpmKeyCandidate[];
  publicContext?: string;
}): Promise<SongSeedAnalysisResponse | null> {
  return globalThis.window?.songSeed?.analyze(input) ?? Promise.resolve(null);
}

export function analyzeSongSeedReference(input: {
  track?: SongSeedTrack;
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
  allowCreditSpend?: boolean;
} = {}): Promise<SongSeedReferenceAnalyzeResponse | null> {
  return globalThis.window?.songSeed?.analyzeReference(input) ?? Promise.resolve(null);
}
