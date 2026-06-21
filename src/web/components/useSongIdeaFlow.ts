import {useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent} from 'react';
import {applyReferenceAnalysis, createSongIdeaAnalysis, normalizeSongIdeaAnalysis, type SongIdeaAnalysis} from '../../onboarding/songIdeaAnalysis';
import {analyzeSongSeed, getSongSeedLyrics, lookupSongSeedBpmKey, searchSongSeed, type SongSeedBpmKeyResponse, type SongSeedLyricStructure, type SongSeedTrack} from '../../native/songSeedApi';
import type {ReferenceMoodAnalysis} from '../../store/referenceMoodAnalysis';
import type {SongAnalysisPhase} from './SongAnalysisPanel';
import {waitForSongMetadata} from './songIdeaMetadataWait';
import {analysisKey, applyDraft, draftFromAnalysis, hasReferenceMetadata, mergeMetadata, mergeReferenceMetadata, mergeSectionEnrichment, trackKey, trackLabel, type LyricsState, type MetadataDraft, type MetadataFieldState, type SearchState} from './songIdeaFlowHelpers';
import {lyricHighlightTiming, nextLyricSectionIndex} from './songLyricHighlightTiming';
export function useSongIdeaFlow(
  onOpenSongIdeaProject: (analysis: SongIdeaAnalysis) => void,
  getReferenceAnalysis: () => ReferenceMoodAnalysis | null = () => null,
  isReferenceSettled = true,
  referenceAnalysis: ReferenceMoodAnalysis | null = null,
) {
  const [mode, setMode] = useState<'choice' | 'idea'>('choice');
  const [songInput, setSongInput] = useState('');
  const [results, setResults] = useState<SongSeedTrack[]>([]);
  const [selectedTrack, setSelectedTrack] = useState<SongSeedTrack | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>('idle');
  const [searchError, setSearchError] = useState<string | null>(null);
  const [lyricsState, setLyricsState] = useState<LyricsState>('idle');
  const [lyricsText, setLyricsText] = useState('');
  const [lyricsCopyright, setLyricsCopyright] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<SongIdeaAnalysis | null>(null);
  const [metadataDraft, setMetadataDraft] = useState<MetadataDraft | null>(null);
  const [activeSection, setActiveSection] = useState(0);
  const [analysisPhase, setAnalysisPhase] = useState<SongAnalysisPhase>('idle');
  const [lookupStatus, setLookupStatus] = useState<string | null>(null);
  const searchRequestRef = useRef(0);
  const lyricsRequestRef = useRef(0);
  const analysisRequestRef = useRef(0);
  const selectionSessionRef = useRef(0);
  const currentTrackKeyRef = useRef<string | null>(null);
  const lyricsTextRef = useRef('');
  const lyricStructureRef = useRef<SongSeedLyricStructure | undefined>(undefined);
  const draftDirtyRef = useRef<Required<MetadataFieldState>>({bpm: false, key: false});
  const metadataCacheRef = useRef(new Map<string, SongSeedBpmKeyResponse | null>());
  const metadataPromiseRef = useRef(new Map<string, Promise<SongSeedBpmKeyResponse | null>>());
  const analysisCacheRef = useRef(new Map<string, SongIdeaAnalysis>());
  const autoOpenedRef = useRef(false);
  const referenceMetadataAppliedRef = useRef<(MetadataFieldState & {id: string}) | null>(null);
  useEffect(() => {
    if (mode !== 'idea') return undefined;
    const query = songInput.trim();
    if (selectedTrack && query === trackLabel(selectedTrack)) {
      setSearchState('idle');
      return undefined;
    }
    if (query.length < 2) {
      setResults([]); setSearchState('idle'); setSearchError(null);
      return undefined;
    }
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    setSearchState('loading');
    setSearchError(null);
    setIsDropdownOpen(true);
    const timer = window.setTimeout(async () => {
      const response = await searchSongSeed(query, 8);
      if (requestId !== searchRequestRef.current) return;
      if (!response) {
        setSearchState('error'); setSearchError('Song search is available in the Electron app.'); return;
      }
      if (!response.ok) {
        setSearchState('error'); setSearchError(response.error); setResults([]); return;
      }
      setResults(response.tracks);
      setHighlightedIndex(0);
      setSearchState(response.tracks.length > 0 ? 'ready' : 'empty');
    }, 300);
    return () => window.clearTimeout(timer);
  }, [mode, selectedTrack, songInput]);
  useEffect(() => {
    if (!analysis || analysisPhase !== 'analysing-sections') return undefined;
    const section = analysis.sections[Math.min(activeSection, Math.max(0, analysis.sections.length - 1))];
    const timer = window.setTimeout(() => {
      setActiveSection(current => {
        const next = nextLyricSectionIndex(analysis.sections, current);
        if (next >= analysis.sections.length) {
          if (!isReferenceSettled) return current;
          if (!autoOpenedRef.current && metadataDraft) {
            autoOpenedRef.current = true;
            onOpenSongIdeaProject(applyReferenceAnalysis(applyDraft(analysis, metadataDraft), getReferenceAnalysis()));
          }
          setAnalysisPhase('complete');
          return current;
        }
        return next;
      });
    }, lyricHighlightTiming(section?.lyrics ?? []).totalMs);
    return () => window.clearTimeout(timer);
  }, [activeSection, analysis, analysisPhase, getReferenceAnalysis, isReferenceSettled, metadataDraft, onOpenSongIdeaProject]);
  useEffect(() => {
    const dirty = draftDirtyRef.current;
    if (!analysis || !referenceAnalysis || !hasReferenceMetadata(referenceAnalysis, dirty)) return;
    const id = `${referenceAnalysis.libraryTrackId}:${referenceAnalysis.bpm ?? ''}:${referenceAnalysis.key ?? ''}:${dirty.bpm}:${dirty.key}`;
    if (referenceMetadataAppliedRef.current?.id === id) return;
    const merged = mergeReferenceMetadata(analysis, referenceAnalysis, dirty);
    const locks = {id, bpm: Boolean(referenceAnalysis.bpm && !dirty.bpm), key: Boolean(referenceAnalysis.key && !dirty.key)};
    referenceMetadataAppliedRef.current = locks;
    setAnalysis(merged);
    setMetadataDraft(current => current ? {
      bpm: locks.bpm ? merged.bpm : current.bpm,
      root: locks.key ? merged.scale.root : current.root,
      mode: locks.key ? merged.scale.mode : current.mode,
    } : current);
    setLookupStatus('Cyanite BPM/key ready');
  }, [analysis, referenceAnalysis]);
  const startMetadataLookup = (track: SongSeedTrack) => {
    const key = trackKey(track);
    if (metadataCacheRef.current.has(key)) return Promise.resolve(metadataCacheRef.current.get(key) ?? null);
    const existing = metadataPromiseRef.current.get(key);
    if (existing) return existing;
    const promise = lookupSongSeedBpmKey({title: track.title, artist: track.artist, album: track.album, releaseYear: track.releaseYear})
      .catch(() => null)
      .then(response => {
        metadataCacheRef.current.set(key, response);
        return response;
      })
      .finally(() => metadataPromiseRef.current.delete(key));
    metadataPromiseRef.current.set(key, promise);
    return promise;
  };
  const applyMetadataResult = (
    track: SongSeedTrack, key: string, sessionId: number, response: SongSeedBpmKeyResponse | null,
  ) => {
    if (selectionSessionRef.current !== sessionId || currentTrackKeyRef.current !== key || !response?.ok) {
      return;
    }
    const metadataAnalysis = createSongIdeaAnalysis({track, lyrics: lyricsTextRef.current, lyricStructure: lyricStructureRef.current, bpmKey: response});
    const locks = referenceMetadataAppliedRef.current ?? {};
    setLookupStatus(`${response.source} metadata ready`);
    setAnalysis(current => current ? mergeMetadata(current, metadataAnalysis, locks) : current);
    setMetadataDraft(current => current ? {
      bpm: draftDirtyRef.current.bpm || locks.bpm ? current.bpm : metadataAnalysis.bpm,
      root: draftDirtyRef.current.key || locks.key ? current.root : metadataAnalysis.scale.root,
      mode: draftDirtyRef.current.key || locks.key ? current.mode : metadataAnalysis.scale.mode,
    } : current);
  };
  const resetIdea = () => {
    setSelectedTrack(null); setAnalysis(null); setMetadataDraft(null);
    setLyricsText(''); setLyricsCopyright(null); setLyricsState('idle');
    setLookupStatus(null); setActiveSection(0); setAnalysisPhase('idle');
    currentTrackKeyRef.current = null; lyricsTextRef.current = ''; lyricStructureRef.current = undefined;
    draftDirtyRef.current = {bpm: false, key: false};
    referenceMetadataAppliedRef.current = null;
    autoOpenedRef.current = false;
    lyricsRequestRef.current += 1;
    analysisRequestRef.current += 1;
    selectionSessionRef.current += 1;
  };
  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSongInput(event.target.value);
    resetIdea();
  };
  const runBackgroundAnalysis = (
    track: SongSeedTrack, key: string, lyrics: string, cacheKey: string,
    metadataPromise: Promise<SongSeedBpmKeyResponse | null>,
    lyricStructure?: SongSeedLyricStructure,
  ) => {
    const requestId = analysisRequestRef.current + 1;
    analysisRequestRef.current = requestId;
    void waitForSongMetadata(metadataPromise)
      .then(response => analyzeSongSeed({track, lyrics, lyricStructure, bpmKeyCandidates: response?.ok ? response.candidates : []}))
      .then(response => {
        if (requestId !== analysisRequestRef.current || currentTrackKeyRef.current !== key) {
          return;
        }
        if (!response?.ok) {
          setLookupStatus('Local structure ready; section enrichment unavailable');
          return;
        }
        if (response.source === 'openrouter') {
          const next = normalizeSongIdeaAnalysis(response.analysis);
          setAnalysis(current => {
            const merged = current ? mergeSectionEnrichment(current, next) : next;
            analysisCacheRef.current.set(cacheKey, merged);
            return merged;
          });
          setLookupStatus(response.warning ?? 'Enhanced section analysis ready');
        } else if (response.warning) setLookupStatus(response.warning);
      });
  };
  const beginAnalysisForTrack = (track: SongSeedTrack, key: string, lyrics: string,
    metadataPromise: Promise<SongSeedBpmKeyResponse | null>, initialMetadata: SongSeedBpmKeyResponse | null, lyricStructure?: SongSeedLyricStructure, structureStatus = '') => {
    const cachedMetadata = initialMetadata ?? metadataCacheRef.current.get(key) ?? null;
    const cacheKey = analysisKey(track, lyrics, lyricStructure, structureStatus);
    const cachedAnalysis = analysisCacheRef.current.get(cacheKey);
    const structureNote = structureStatus.startsWith('unavailable') ? 'Musixmatch structure unavailable; using local lyric parser' : undefined;
    const localAnalysis = cachedAnalysis ?? createSongIdeaAnalysis({
      track, lyrics, lyricStructure, structureNote, bpmKey: cachedMetadata?.ok ? cachedMetadata : null,
    });
    draftDirtyRef.current = {bpm: false, key: false};
    autoOpenedRef.current = false;
    lyricsTextRef.current = lyrics;
    setAnalysis(localAnalysis);
    setMetadataDraft(draftFromAnalysis(localAnalysis));
    setActiveSection(0);
    setAnalysisPhase('analysing-sections');
    setLookupStatus(cachedAnalysis
      ? 'Enhanced analysis ready'
      : structureNote
        ? structureNote
      : cachedMetadata?.ok ? 'Local structure ready; refining in background' : 'Estimating metadata; refining in background');
    if (!cachedAnalysis) {
      runBackgroundAnalysis(track, key, lyrics, cacheKey, metadataPromise, lyricStructure);
    }
  };
  const selectTrack = async (track: SongSeedTrack) => {
    const sessionId = selectionSessionRef.current + 1;
    const requestId = lyricsRequestRef.current + 1;
    const key = trackKey(track);
    selectionSessionRef.current = sessionId;
    lyricsRequestRef.current = requestId;
    currentTrackKeyRef.current = key;
    searchRequestRef.current += 1;
    setSelectedTrack(track);
    setSongInput(trackLabel(track));
    setIsDropdownOpen(false);
    setAnalysis(null);
    setMetadataDraft(null);
    setLyricsText('');
    setLyricsCopyright(null);
    setLyricsState('loading');
    setLookupStatus('Loading lyrics, tempo, and key');
    setActiveSection(0);
    setAnalysisPhase('checking-metadata');
    lyricsTextRef.current = ''; lyricStructureRef.current = undefined;
    draftDirtyRef.current = {bpm: false, key: false};
    referenceMetadataAppliedRef.current = null;
    autoOpenedRef.current = false;
    const metadataPromise = startMetadataLookup(track);
    void metadataPromise.then(response => applyMetadataResult(track, key, sessionId, response));
    const response = await getSongSeedLyrics(track);
    if (selectionSessionRef.current !== sessionId || requestId !== lyricsRequestRef.current) {
      return;
    }
    if (response?.ok) {
      lyricsTextRef.current = response.lyrics;
      lyricStructureRef.current = response.structure;
      setLyricsText(response.lyrics);
      setLyricsCopyright(response.copyright ?? null);
      setLyricsState('ready');
      const structureStatus = [response.structureSource, response.structureUnavailableReason].filter(Boolean).join(':');
      beginAnalysisForTrack(track, key, response.lyrics, metadataPromise, metadataCacheRef.current.get(key) ?? null, response.structure, structureStatus);
      return;
    }
    lyricStructureRef.current = undefined;
    setLyricsState('error');
    setLookupStatus(response?.error ?? 'Lyrics are unavailable for this song.');
    const metadata = await waitForSongMetadata(metadataPromise);
    if (selectionSessionRef.current !== sessionId) return;
    beginAnalysisForTrack(track, key, '', metadataPromise, metadata?.ok ? metadata : null);
  };
  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen || results.length === 0) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex(index => Math.min(results.length - 1, index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex(index => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void selectTrack(results[highlightedIndex]);
    } else if (event.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };
  const handleDraftChange = (draft: MetadataDraft) => {
    setMetadataDraft(current => {
      if (current) draftDirtyRef.current = {
        bpm: draftDirtyRef.current.bpm || draft.bpm !== current.bpm,
        key: draftDirtyRef.current.key || draft.root !== current.root || draft.mode !== current.mode,
      };
      return draft;
    });
  };
  const handleOpenProject = () => {
    autoOpenedRef.current = true;
    return analysis && metadataDraft && isReferenceSettled
      ? onOpenSongIdeaProject(applyReferenceAnalysis(applyDraft(analysis, metadataDraft), getReferenceAnalysis()))
      : undefined;
  };
  return {
    mode, setMode, songInput, results, selectedTrack, highlightedIndex, isDropdownOpen,
    searchState, searchError, lyricsState, lyricsText, lyricsCopyright, analysis,
    metadataDraft, activeSection, analysisPhase, lookupStatus, setActiveSection,
    setIsDropdownOpen, handleInputChange, selectTrack, handleSearchKeyDown,
    handleDraftChange, handleOpenProject,
  };
}
