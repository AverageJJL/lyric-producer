import React from 'react';

import type {SongIdeaAnalysis} from '../../onboarding/songIdeaAnalysis';
import {PROJECT_KEY_ROOTS, PROJECT_SCALE_MODES} from '../../store/projectMetadata';

type SongMetadataDraft = {
  bpm: number;
  root: string;
  mode: string;
};

type SongMetadataDraftPanelProps = {
  analysis: SongIdeaAnalysis;
  draft: SongMetadataDraft;
  onChange: (draft: SongMetadataDraft) => void;
};

export function SongMetadataDraftPanel({
  analysis,
  draft,
  onChange,
}: SongMetadataDraftPanelProps) {
  const confidence = Math.round(analysis.bpmKey.confidence * 100);
  return (
    <div className="song-metadata-draft">
      <div>
        <span>Project metadata</span>
        <small>{analysis.bpmKey.source} confidence {confidence}%</small>
      </div>
      <label>
        BPM
        <input
          type="number"
          min={40}
          max={240}
          value={draft.bpm}
          onChange={event => onChange({...draft, bpm: Number(event.target.value) || draft.bpm})}
        />
      </label>
      <label>
        Key
        <select value={draft.root} onChange={event => onChange({...draft, root: event.target.value})}>
          {PROJECT_KEY_ROOTS.map(root => <option key={root} value={root}>{root}</option>)}
        </select>
      </label>
      <label>
        Scale
        <select value={draft.mode} onChange={event => onChange({...draft, mode: event.target.value})}>
          {PROJECT_SCALE_MODES.map(mode => <option key={mode} value={mode}>{mode}</option>)}
        </select>
      </label>
      {analysis.bpmKey.note ? <p>{analysis.bpmKey.note}</p> : null}
    </div>
  );
}
