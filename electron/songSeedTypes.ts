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

export type SongSeedLyricStructureRole =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'hook'
  | 'bridge'
  | 'outro';

export type SongSeedLyricStructure = Partial<Record<SongSeedLyricStructureRole, number[]>>;

export type SongSeedLyricStructureSource = 'catalog-feed' | 'unavailable';

export type SongSeedSyncedLyricLine = {
  text: string;
  startSeconds: number;
  endSeconds?: number;
};

export type SongSeedSearchRequest = {
  query?: string;
  limit?: number;
};

export type SongSeedLyricsRequest = {
  trackId?: string;
  trackIsrc?: string;
  commontrackId?: string;
  hasTrackStructure?: boolean;
};

export type SongSeedLyricsSimilarityRequest = {
  lyrics?: string;
  lineIds?: string[];
};

export type SongSeedBpmKeyRequest = {
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
};

export type ProviderErrorCode =
  | 'missing_key'
  | 'empty_query'
  | 'not_found'
  | 'network_error'
  | 'unauthorized';

export type SongSeedReferenceErrorCode =
  | ProviderErrorCode
  | 'analysis_failed'
  | 'invalid_file'
  | 'limit_exceeded'
  | 'rate_limited'
  | 'timeout';

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
      structureSource?: SongSeedLyricStructureSource;
      structureUnavailableReason?: string;
      syncedLyrics?: SongSeedSyncedLyricLine[];
      syncedLyricsSource?: 'musixmatch-subtitle';
    }
  | {ok: false; code: ProviderErrorCode | 'no_lyrics'; error: string};

export type SongSeedLyricsSimilarityMatch = {
  candidateId: string;
  title: string;
  artist?: string;
  score: number;
  rhymeScore?: number;
  longestOverlap: string;
  matchedEndWords?: string[];
  matchedLineIds: string[];
  rhymeMatchedLineIds?: string[];
};

export type SongSeedLyricsSimilarityReport = {
  checkedAt: string;
  risk: 'low' | 'medium' | 'high' | 'unavailable';
  matches: SongSeedLyricsSimilarityMatch[];
  note?: string;
};

export type SongSeedLyricsSimilarityResponse =
  | {ok: true; report: SongSeedLyricsSimilarityReport}
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

export type SongSeedReferenceSegment = {
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

export type SongSeedReferenceSource = {
  kind: 'youtube';
  url: string;
  videoId: string;
  title: string;
  channelTitle: string;
  confidence: number;
  matchReason?: string;
};

export type SongSeedReferenceAnalysis = {
  provider: 'cyanite';
  libraryTrackId: string;
  source?: SongSeedReferenceSource;
  cacheStatus?: SongSeedReferenceCacheStatus;
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
  segments: SongSeedReferenceSegment[];
};

export type SongSeedReferenceAnalyzeRequest = {
  track?: SongSeedTrack;
  title?: string;
  artist?: string;
  album?: string;
  releaseYear?: string;
  allowCreditSpend?: boolean;
};

export type SongSeedReferenceCacheStatus = 'cache' | 'library' | 'analyzed';

export type SongSeedReferenceAnalyzeResponse =
  | {ok: true; analysis: SongSeedReferenceAnalysis; cacheStatus?: SongSeedReferenceCacheStatus}
  | {ok: false; code: SongSeedReferenceErrorCode; error: string; source?: SongSeedReferenceSource};
