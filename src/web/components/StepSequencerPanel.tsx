import React, {useCallback, useMemo} from 'react';

import {upsertBlockForEngine} from '../../native/refreshPlayback';
import {setDrumPatternStepOnEngine} from '../../native/blockSync';

import {DRUM_LANE_ICONS, DRUM_LANE_LABELS, DRUM_LANE_TOOLTIPS, DRUM_SAMPLE_KEYS, type DrumSampleKey} from '../../assets/drumKit';
import {useDrumPatternTransport} from '../../hooks/useDrumPatternTransport';
import {useSamplePreview} from '../../hooks/useSamplePreview';
import {normalizeDrumPattern, STEPS_PER_BAR} from '../../music/drumPatterns';
import {instrumentForTrack} from '../../music/instruments';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import {getTrackInstrumentLabel, useDAWStore} from '../../store/useDAWStore';

type StepSequencerPanelProps = {
  track: DAWTrack;
  selectedBlockId: string | null;
  isDrumLibraryInstalled?: boolean;
  onDownloadDrumLibrary?: () => void;
};

function findDrumBlock(trackId: string, selectedBlockId: string | null, blocks: DAWBlock[]): DAWBlock | null {
  if (selectedBlockId) {
    const selected = blocks.find(item => item.id === selectedBlockId && item.trackId === trackId && item.patternId);
    if (selected) {
      return selected;
    }
  }
  return blocks.find(item => item.trackId === trackId && item.patternId) ?? null;
}

export function StepSequencerPanel({
  track,
  selectedBlockId,
  isDrumLibraryInstalled = true,
  onDownloadDrumLibrary,
}: StepSequencerPanelProps) {
  const blocks = useDAWStore(state => state.blocks);
  const patterns = useDAWStore(state => state.patterns);
  const bpm = useDAWStore(state => state.bpm);
  const isTransportPlaying = useDAWStore(state => state.isPlaying);
  const toggleDrumStep = useDAWStore(state => state.toggleDrumStep);
  const {previewSample} = useSamplePreview();
  const activeBlock = useMemo(() => findDrumBlock(track.id, selectedBlockId, blocks), [blocks, selectedBlockId, track.id]);
  const rawPattern = activeBlock?.patternId ? patterns[activeBlock.patternId] : null;
  const pattern = rawPattern ? normalizeDrumPattern(rawPattern) : null;
  const {isLocalPlaying, currentStep, toggleLocalPlayback, stopLocalPlayback} = useDrumPatternTransport({
    trackId: track.id,
    bpm,
    pattern,
    isTransportPlaying,
  });
  const kitLabel = useMemo(() => instrumentForTrack(track.type, track.instrumentId).sampleKitId ?? getTrackInstrumentLabel(track), [track]);

  const syncPatternToEngine = useCallback(() => {
    if (!activeBlock?.patternId) {
      return;
    }
    blocks
      .filter(block => block.patternId === activeBlock.patternId)
      .forEach(upsertBlockForEngine);
  }, [activeBlock?.patternId, blocks]);

  const handleToggleLocalPlayback = useCallback(() => {
    if (isLocalPlaying) {
      stopLocalPlayback();
      syncPatternToEngine();
      return;
    }
    toggleLocalPlayback();
  }, [isLocalPlaying, stopLocalPlayback, syncPatternToEngine, toggleLocalPlayback]);

  if (!pattern) {
    return (
      <section className="editor-panel">
        <p className="editor-empty">Select a drum pattern clip on the timeline.</p>
      </section>
    );
  }

  const toggleStep = (sampleKey: DrumSampleKey, step: number) => {
    const wasActive = pattern.steps[sampleKey][step];
    const nextActive = !wasActive;
    const canSyncArrangement = !isLocalPlaying && !isTransportPlaying;
    toggleDrumStep(pattern.id, sampleKey, step, {syncEngine: canSyncArrangement});
    if (!isLocalPlaying && isTransportPlaying) {
      blocks
        .filter(block => block.patternId === pattern.id)
        .forEach(block => setDrumPatternStepOnEngine(block, sampleKey, step, nextActive));
    }
    if (!wasActive && !isLocalPlaying && !isTransportPlaying && isDrumLibraryInstalled) {
      previewSample({trackId: track.id, sampleKey, step, velocity: 100});
    }
  };

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <h2>Drum Machine</h2>
          <p>{track.name} · {kitLabel}</p>
        </div>
        <div className="editor-actions">
          <button type="button" disabled>{pattern.name}</button>
          <button
            type="button"
            className={isLocalPlaying ? 'active' : ''}
            onClick={handleToggleLocalPlayback}
            disabled={!isDrumLibraryInstalled}>
            {isLocalPlaying ? 'Stop' : 'Play'}
          </button>
        </div>
      </div>
      {!isDrumLibraryInstalled ? (
        <div className="editor-warning">
          <span>Download Required</span>
          <button type="button" onClick={onDownloadDrumLibrary}>Download Drums</button>
        </div>
      ) : null}
      <div className="step-grid">
        {DRUM_SAMPLE_KEYS.map(sampleKey => (
          <div key={sampleKey} className="step-row">
            <button
              type="button"
              className="lane-header"
              title={DRUM_LANE_TOOLTIPS[sampleKey]}
              disabled={!isDrumLibraryInstalled}
              onClick={() => previewSample({trackId: track.id, sampleKey, velocity: 100})}>
              <img src={DRUM_LANE_ICONS[sampleKey]} alt="" />
              <span>{DRUM_LANE_LABELS[sampleKey]}</span>
            </button>
            <div className="steps-row">
              {Array.from({length: STEPS_PER_BAR}, (_, step) => (
                <button
                  key={`${sampleKey}-${step}`}
                  type="button"
                  className={[
                    'step-cell',
                    step % 4 === 0 ? 'beat-start' : '',
                    step >= 12 ? 'beat-group-end' : '',
                    pattern.steps[sampleKey][step] ? 'active' : '',
                    currentStep === step && isLocalPlaying ? 'playhead' : '',
                  ].join(' ')}
                  onClick={() => toggleStep(sampleKey, step)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
