import React from 'react';

import type {SongIdeaAnalysis} from '../../onboarding/songIdeaAnalysis';
import type {ReferenceMoodAnalysis, ReferenceMoodSegment, ReferenceMoodSource} from '../../store/referenceMoodAnalysis';
import {PROJECT_KEY_ROOTS, PROJECT_SCALE_MODES} from '../../store/projectMetadata';
import type {SongSeedReferenceCacheStatus} from '../../native/songSeedApi';

export type SongAnalysisPhase =
  | 'idle'
  | 'checking-metadata'
  | 'web-metadata'
  | 'analysing-sections'
  | 'complete';

type SongMetadataDraft = {
  bpm: number;
  root: string;
  mode: string;
};

type SongAnalysisPanelProps = {
  phase: SongAnalysisPhase;
  analysis: SongIdeaAnalysis | null;
  activeSection: number;
  draft: SongMetadataDraft | null;
  status: string | null;
  referenceAnalysis: ReferenceMoodAnalysis | null;
  referenceState: 'idle' | 'loading' | 'confirming' | 'ready' | 'error';
  referenceStatus: string | null;
  referenceSource: ReferenceMoodSource | null;
  referenceCacheStatus: SongSeedReferenceCacheStatus | null;
  onDraftChange: (draft: SongMetadataDraft) => void;
  onOpenProject: () => void;
  onConfirmReferenceSpend: () => void;
  onSkipReference: () => void;
};

const PHASE_LABELS: Record<SongAnalysisPhase, string> = {
  idle: 'Ready',
  'checking-metadata': 'Checking metadata',
  'web-metadata': 'Searching web metadata',
  'analysing-sections': 'Analysing sections',
  complete: 'Analysis complete',
};

function label(value: string): string {
  return value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}

function referenceChips(reference: ReferenceMoodAnalysis): string[] {
  return [
    ...(reference.moodTags ?? []),
    ...(reference.moodAdvancedTags ?? []),
    ...(reference.movementTags ?? []),
    ...(reference.characterTags ?? []),
    ...(reference.instrumentTags ?? []),
    ...(reference.genreTags ?? []),
    ...(reference.voiceTags ?? []),
  ].filter((item, index, all) => item && all.indexOf(item) === index).slice(0, 9);
}

function segmentHeight(segment: ReferenceMoodSegment): string {
  const value = segment.arousal ?? segment.moodScore ?? 0;
  const normalized = value >= -1 && value <= 1 ? (value + 1) / 2 : value;
  return `${Math.max(18, Math.min(100, Math.round(normalized * 100)))}%`;
}

export function SongAnalysisPanel({
  phase,
  analysis,
  activeSection,
  draft,
  status,
  referenceAnalysis,
  referenceState,
  referenceStatus,
  referenceSource,
  referenceCacheStatus,
  onDraftChange,
  onOpenProject,
  onConfirmReferenceSpend,
  onSkipReference,
}: SongAnalysisPanelProps) {
  const section = analysis?.sections[Math.min(activeSection, Math.max(0, analysis.sections.length - 1))];
  const isComplete = phase === 'complete';
  const canOpenProject = Boolean(analysis && draft && referenceState !== 'loading' && referenceState !== 'confirming');
  const chips = referenceAnalysis ? referenceChips(referenceAnalysis) : [];
  const ribbon = referenceAnalysis?.segments.slice(0, 20) ?? [];
  const source = referenceAnalysis?.source ?? referenceSource;
  const metadataSource = referenceAnalysis?.bpm || referenceAnalysis?.key ? 'BPM/key source: Cyanite reference' : analysis?.keySource;
  const cacheLabel = referenceCacheStatus === 'cache' ? 'cache hit' : referenceCacheStatus === 'library' ? 'library reuse' : referenceCacheStatus === 'analyzed' ? 'credit used' : referenceState === 'confirming' ? 'credit needed' : 'checking reuse';
  return (
    <aside className="song-analysis-panel" aria-label="Song analysis">
      <header className="song-analysis-header">
        {draft ? (
          <div className="song-analysis-meta">
            <label>
              BPM
              <input type="number" min={40} max={240} value={draft.bpm} onChange={event => onDraftChange({...draft, bpm: Number(event.target.value) || draft.bpm})} />
            </label>
            <label>
              Key
              <select value={draft.root} onChange={event => onDraftChange({...draft, root: event.target.value})}>
                {PROJECT_KEY_ROOTS.map(root => <option key={root} value={root}>{root}</option>)}
              </select>
            </label>
            <label>
              Scale
              <select value={draft.mode} onChange={event => onDraftChange({...draft, mode: event.target.value})}>
                {PROJECT_SCALE_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
              </select>
            </label>
          </div>
        ) : <span className="song-analysis-pending">Preparing</span>}
      </header>
      <div className="song-analysis-body">
        <p className="song-analysis-phase">{isComplete ? null : <span />}{PHASE_LABELS[phase]}</p>
        {section ? (
          <article className="song-analysis-current">
            <span>{section.name}</span>
            <h2>{section.mood}</h2>
            <p>{section.meaning}</p>
            {section.producerInsight ? (
              <div className="song-analysis-summary" aria-label="Producer summary">
                <strong>Production move</strong>
                <p>{section.producerInsight.arrangementMove}</p>
                <strong>Mix focus</strong>
                <p>{section.producerInsight.mixFocus}</p>
              </div>
            ) : (
              <>
                <strong>{section.productionCue}</strong>
                <small>{section.productionDrivers.join(', ')}</small>
              </>
            )}
          </article>
        ) : (
          <article className="song-analysis-current loading">
            <span>Analysis</span>
            <h2>Reading the track</h2>
            <p>{status ?? 'Preparing lyrics, tempo, key, and section notes.'}</p>
          </article>
        )}
        {referenceAnalysis || referenceStatus ? (
          <section className={`song-reference-readout ${referenceState}`} aria-label="Cyanite reference analysis">
            <div className="song-reference-heading">
              <span>Cyanite reference - {cacheLabel}</span>
              <strong>{referenceAnalysis?.caption ?? referenceStatus ?? chips.slice(0, 3).map(label).join(', ')}</strong>
            </div>
            {referenceAnalysis?.bpm || referenceAnalysis?.key ? (
              <p className="song-reference-meta">
                {[referenceAnalysis.bpm ? `${Math.round(referenceAnalysis.bpm)} BPM` : null, referenceAnalysis.key ? label(referenceAnalysis.key) : null].filter(Boolean).join(' / ')}
              </p>
            ) : null}
            {ribbon.length > 0 ? (
              <div className="song-reference-ribbon" aria-hidden="true">
                {ribbon.map(segment => (
                  <span
                    key={segment.timestamp}
                    style={{height: segmentHeight(segment)}}
                    title={[segment.mood, segment.valence, segment.arousal].filter(Boolean).join(' / ')}
                  />
                ))}
              </div>
            ) : null}
            {source ? (
              <a className="song-reference-source" href={source.url} target="_blank" rel="noreferrer">
                {source.title}<small>{source.channelTitle} - {Math.round(source.confidence * 100)}%</small>
              </a>
            ) : null}
            {chips.length > 0 ? (
              <div className="song-reference-chips">
                {chips.map(item => <span key={item}>{label(item)}</span>)}
              </div>
            ) : null}
            {referenceState === 'confirming' ? (
              <div className="song-reference-action">
                <button type="button" className="onboarding-secondary" onClick={onConfirmReferenceSpend}>Use 1 Cyanite analysis</button>
                <button type="button" className="onboarding-link" onClick={onSkipReference}>Skip Cyanite</button>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
      <footer className="song-analysis-footer">
        {status ? <p>{status}</p> : <p>{metadataSource ?? 'Metadata will appear here.'}</p>}
        <button type="button" className="onboarding-secondary" onClick={onOpenProject} disabled={!canOpenProject}>
          Open DAW with this structure
        </button>
      </footer>
    </aside>
  );
}
