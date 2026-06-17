import React from 'react';

import {
  COPILOT_DRUM_PATTERN_DRAG_TYPE,
  encodeCopilotDrumPatternDrag,
} from '../../assistant/copilotDrumPatternDrag';
import type {CopilotDrumPatternOption} from '../../assistant/copilotDrumPatternOptions';
import {DRUM_LANE_LABELS, DRUM_SAMPLE_KEYS} from '../../assets/drumKit';
import {ImportArrowIcon, PlayTriangleIcon, StopSquareIcon} from './icons/WorkspaceIcons';

type CopilotDrumPatternOptionCardProps = {
  option: CopilotDrumPatternOption;
  isPlaying: boolean;
  status?: string;
  error?: string;
  onPlay: (option: CopilotDrumPatternOption) => void;
  onStop: () => void;
  onImport: (option: CopilotDrumPatternOption) => void;
};

function hitCount(option: CopilotDrumPatternOption): number {
  return DRUM_SAMPLE_KEYS.reduce((count, key) => count + option.lanes[key].length, 0);
}

export function CopilotDrumPatternOptionCard({
  option,
  isPlaying,
  status,
  error,
  onPlay,
  onStop,
  onImport,
}: CopilotDrumPatternOptionCardProps) {
  return (
    <article
      className="copilot-drum-option-card"
      draggable
      onDragStart={event => {
        event.dataTransfer.setData(COPILOT_DRUM_PATTERN_DRAG_TYPE, encodeCopilotDrumPatternDrag(option));
        event.dataTransfer.effectAllowed = 'copy';
      }}>
      <div className="copilot-midi-option-header">
        <div>
          <strong>{option.label}</strong>
          <span>Drum pattern · {hitCount(option)} hits</span>
        </div>
        <span>{option.lengthBeats} beats</span>
      </div>
      <div className="copilot-drum-grid" role="img" aria-label={`${option.label} drum pattern preview`}>
        {DRUM_SAMPLE_KEYS.map(sampleKey => (
          <div className="copilot-drum-row" key={sampleKey}>
            <span>{DRUM_LANE_LABELS[sampleKey]}</span>
            <div>
              {Array.from({length: 16}, (_, step) => (
                <i
                  key={`${sampleKey}-${step}`}
                  className={[
                    step % 4 === 0 ? 'beat-start' : '',
                    option.lanes[sampleKey].includes(step) ? 'active' : '',
                  ].join(' ')}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
      {option.description ? <p className="copilot-midi-option-meta">{option.description}</p> : null}
      {status ? <p className="copilot-midi-option-status">{status}</p> : null}
      {error ? <p className="copilot-midi-option-error">{error}</p> : null}
      <div className="copilot-midi-option-actions">
        <button type="button" onClick={() => (isPlaying ? onStop() : onPlay(option))} title={isPlaying ? 'Stop preview' : 'Play preview'} aria-label={isPlaying ? 'Stop preview' : 'Play preview'}>
          {isPlaying ? <StopSquareIcon /> : <PlayTriangleIcon />}
        </button>
        <button type="button" onClick={() => onImport(option)} title="Import drum pattern" aria-label="Import drum pattern">
          <ImportArrowIcon />
        </button>
        <span aria-hidden="true">Drag to drum track</span>
      </div>
    </article>
  );
}
