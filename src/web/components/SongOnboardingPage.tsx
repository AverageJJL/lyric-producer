import React from 'react';

import type {ProjectFileLifecycle} from '../../hooks/useProjectFileLifecycle';
import {analyzeSongSeedReference, type SongSeedReferenceAnalyzeResponse, type SongSeedReferenceCacheStatus} from '../../native/songSeedApi';
import type {SongIdeaAnalysis} from '../../onboarding/songIdeaAnalysis';
import type {ReferenceMoodAnalysis, ReferenceMoodSource} from '../../store/referenceMoodAnalysis';
import {SongAnalysisPanel} from './SongAnalysisPanel';
import {SongLyricWheel} from './SongLyricWheel';
import {SongSearchForm} from './SongSearchForm';
import {trackLabel} from './songIdeaFlowHelpers';
import {useSongIdeaFlow} from './useSongIdeaFlow';

type SongOnboardingPageProps = {
  projectFiles?: Pick<ProjectFileLifecycle, 'isBusy' | 'recentProjects' | 'openProject' | 'openRecentProject'>;
  onOpenEmptyProject: () => void;
  onOpenSongIdeaProject: (analysis: SongIdeaAnalysis) => void;
};

function projectName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function apcProjects(paths: string[]): string[] {
  return paths.filter(path => /\.apc$/i.test(path.trim())).slice(0, 5);
}

const CYANITE_CREDITS_DEMO_MESSAGE = 'Cyanite usage limits reached in the public demo. Please see the demo video for how this feature works.';

function cyaniteStatus(response: SongSeedReferenceAnalyzeResponse | null | undefined): string {
  return response && !response.ok && response.code === 'limit_exceeded'
    ? CYANITE_CREDITS_DEMO_MESSAGE
    : response?.ok ? 'Cyanite reference ready' : response?.error ?? 'Cyanite reference analysis is unavailable. Continuing without it.';
}

export function SongOnboardingPage({projectFiles, onOpenEmptyProject, onOpenSongIdeaProject}: SongOnboardingPageProps) {
  const [referenceAnalysis, setReferenceAnalysis] = React.useState<ReferenceMoodAnalysis | null>(null);
  const [referenceState, setReferenceState] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [referenceStatus, setReferenceStatus] = React.useState<string | null>(null);
  const [referenceSource, setReferenceSource] = React.useState<ReferenceMoodSource | null>(null);
  const [referenceCacheStatus, setReferenceCacheStatus] = React.useState<SongSeedReferenceCacheStatus | null>(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = React.useState(false);
  const referenceRunRef = React.useRef(0);
  const referenceRef = React.useRef<ReferenceMoodAnalysis | null>(null);
  React.useEffect(() => { referenceRef.current = referenceAnalysis; }, [referenceAnalysis]);
  const getReferenceAnalysis = React.useCallback(() => referenceRef.current, []);
  const isReferenceSettled = referenceState === 'ready' || referenceState === 'error';
  const flow = useSongIdeaFlow(onOpenSongIdeaProject, getReferenceAnalysis, isReferenceSettled, referenceAnalysis);
  const selectedTitle = flow.selectedTrack ? trackLabel(flow.selectedTrack) : 'Song idea';
  const hasStartedAnalysis = flow.analysisPhase !== 'idle';
  const isIdeaMode = flow.mode === 'idea';
  const isSearchOnly = isIdeaMode && !hasStartedAnalysis;
  const pageClassName = `onboarding-page ${hasStartedAnalysis ? 'analysis-active' : ''}`;
  const recentProjects = apcProjects(projectFiles?.recentProjects ?? []);

  const runReferenceAnalysis = React.useCallback(() => {
    const track = flow.selectedTrack;
    if (!track) return;
    const runId = referenceRunRef.current + 1;
    referenceRunRef.current = runId;
    setReferenceState('loading');
    setReferenceStatus('Finding YouTube reference');
    const timers = [
      window.setTimeout(() => runId === referenceRunRef.current && setReferenceStatus('Checking local reference cache'), 800),
      window.setTimeout(() => runId === referenceRunRef.current && setReferenceStatus('Checking Cyanite library reuse'), 1700),
      window.setTimeout(() => runId === referenceRunRef.current && setReferenceStatus('Waiting for Cyanite V7 classifiers'), 3100),
      window.setTimeout(() => runId === referenceRunRef.current && setReferenceStatus('Parsing Cyanite mood and production curves'), 6200),
    ];
    const referenceRequest = {track, allowCreditSpend: true};
    void Promise.resolve(analyzeSongSeedReference(referenceRequest)).then(response => {
      if (runId !== referenceRunRef.current) return;
      timers.forEach(window.clearTimeout);
      if (response?.ok) {
        const analysis = {...response.analysis, cacheStatus: response.cacheStatus ?? response.analysis.cacheStatus};
        const source = analysis.source;
        setReferenceAnalysis(analysis);
        setReferenceSource(source ?? null);
        setReferenceCacheStatus(response.cacheStatus ?? response.analysis.cacheStatus ?? null);
        setReferenceState('ready');
        setReferenceStatus(source ? `Cyanite reference ready: ${source.title}` : 'Cyanite reference ready');
      } else {
        setReferenceState('error');
        setReferenceStatus(cyaniteStatus(response));
      }
    });
  }, [flow.selectedTrack]);

  React.useEffect(() => {
    setReferenceAnalysis(null);
    setReferenceSource(null);
    setReferenceCacheStatus(null);
    if (!flow.selectedTrack) {
      referenceRunRef.current += 1;
      setReferenceState('idle');
      setReferenceStatus(null);
      return;
    }
    runReferenceAnalysis();
  }, [flow.selectedTrack?.id, runReferenceAnalysis]);

  const resetReference = React.useCallback(() => {
    referenceRunRef.current += 1;
    setReferenceAnalysis(null); setReferenceSource(null); setReferenceCacheStatus(null);
    setReferenceState('idle'); setReferenceStatus(null);
  }, []);
  const leaveIdeaMode = React.useCallback(() => {
    resetReference();
    setIsDiscardConfirmOpen(false);
    flow.returnToChoice();
  }, [flow.returnToChoice, resetReference]);
  const handleBack = React.useCallback(() => {
    if (hasStartedAnalysis) {
      setIsDiscardConfirmOpen(true);
      return;
    }
    leaveIdeaMode();
  }, [hasStartedAnalysis, leaveIdeaMode]);

  return (
    <section className={pageClassName} aria-label="Project onboarding">
      <div className={`onboarding-frame ${isIdeaMode ? 'idea-mode' : ''} ${isSearchOnly ? 'search-only' : ''} ${hasStartedAnalysis ? 'analysis-mode' : ''}`}>
        {flow.mode === 'choice' ? null : (
          <div className="song-idea-topbar">
            <button type="button" className="onboarding-link" aria-label="Back" onClick={handleBack}>
              <span aria-hidden="true">&larr;</span>
            </button>
          </div>
        )}
        {isDiscardConfirmOpen ? (
          <div className="song-discard-overlay" role="dialog" aria-modal="true" aria-labelledby="song-discard-title">
            <div className="song-discard-dialog">
              <h2 id="song-discard-title">Discard analysis?</h2>
              <p>This will stop the current song analysis and return to the home page.</p>
              <div className="song-discard-actions">
                <button type="button" className="song-discard-button secondary" onClick={leaveIdeaMode}>Discard analysis</button>
                <button type="button" className="song-discard-button primary" onClick={() => setIsDiscardConfirmOpen(false)}>Keep analysing</button>
              </div>
            </div>
          </div>
        ) : null}

        {flow.mode === 'choice' ? (
          <div className="onboarding-home">
            <header className="onboarding-header onboarding-home-title">
              <h1>Create a masterpiece.</h1>
            </header>
            <section className="onboarding-begin" aria-labelledby="onboarding-begin-title">
              <h2 id="onboarding-begin-title">Begin</h2>
              <div className="onboarding-choice-grid" aria-label="Start options">
                <button type="button" className="onboarding-choice primary" onClick={onOpenEmptyProject}>
                  <span>Empty project</span><strong>Open the DAW with a blank timeline.</strong>
                </button>
                <button type="button" className="onboarding-choice" onClick={() => flow.setMode('idea')}>
                  <span>I have an idea already</span>
                  <strong>Search a song, pull lyrics, and build markers, BPM, and key.</strong>
                </button>
              </div>
            </section>
            <section className="onboarding-recent" aria-labelledby="onboarding-recent-title">
              <div className="onboarding-recent-heading">
                <h2 id="onboarding-recent-title">Recent</h2>
              </div>
              <div className="onboarding-recent-list">
                {recentProjects.length > 0 ? recentProjects.map(path => (
                  <button
                    key={path}
                    type="button"
                    className="onboarding-recent-item"
                    disabled={projectFiles?.isBusy}
                    onClick={() => void projectFiles?.openRecentProject(path)}>
                    <span>{projectName(path)}</span>
                    <small>{path}</small>
                  </button>
                )) : <p>No recent projects yet.</p>}
              </div>
              <button
                type="button"
                className="onboarding-open-link"
                disabled={!projectFiles || projectFiles.isBusy}
                onClick={() => void projectFiles?.openProject()}>
                Open existing project
              </button>
            </section>
          </div>
        ) : (
          <div className={`song-idea-workbench ${isSearchOnly ? 'search-only' : ''} ${hasStartedAnalysis ? 'analysing' : ''}`}>
            {!hasStartedAnalysis ? (
              <SongSearchForm
                songInput={flow.songInput}
                results={flow.results}
                highlightedIndex={flow.highlightedIndex}
                isDropdownOpen={flow.isDropdownOpen}
                searchState={flow.searchState}
                searchError={flow.searchError}
                onInputChange={flow.handleInputChange}
                onInputFocus={() => flow.setIsDropdownOpen(flow.results.length > 0 || flow.searchState !== 'idle')}
                onInputKeyDown={flow.handleSearchKeyDown}
                onSelectTrack={track => void flow.selectTrack(track)}
              />
            ) : (
              <div className="song-analysis-surface">
                <SongAnalysisPanel
                  phase={flow.analysisPhase}
                  analysis={flow.analysis}
                  activeSection={flow.activeSection}
                  draft={flow.metadataDraft}
                  status={flow.lookupStatus}
                  referenceAnalysis={referenceAnalysis}
                  referenceState={referenceState}
                  referenceStatus={referenceStatus}
                  referenceSource={referenceSource}
                  referenceCacheStatus={referenceCacheStatus}
                  canFastForward={flow.canFastForward}
                  onDraftChange={flow.handleDraftChange}
                  onOpenProject={flow.handleOpenProject}
                />
                <SongLyricWheel
                  analysis={flow.analysis}
                  activeSection={flow.activeSection}
                  analysisPhase={flow.analysisPhase}
                  lyricsText={flow.lyricsText}
                  lyricsState={flow.lyricsState}
                  selectedTitle={selectedTitle}
                  copyright={flow.lyricsCopyright}
                  onActiveSectionChange={flow.setActiveSection}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
