import React from 'react';

import {TrashBinIcon} from './icons/WorkspaceIcons';

type LyricsPanelAnalysisControlsProps = {
  onRemoveLyricAnalysis: () => void;
};

export function LyricsPanelAnalysisControls({
  onRemoveLyricAnalysis,
}: LyricsPanelAnalysisControlsProps) {
  const removeAnalysis = () => {
    const confirmed = window.confirm('Remove lyric analysis, section markers, and authored lyrics? Undo can restore them.');
    if (confirmed) {
      onRemoveLyricAnalysis();
    }
  };

  return (
    <button
      type="button"
      className="lyrics-remove-analysis-button"
      aria-label="Remove lyric analysis"
      title="Clear lyrics, lyric analysis, and section markers. Undo restores them."
      data-tooltip="Clear lyrics and markers"
      onClick={removeAnalysis}>
      <TrashBinIcon className="lyrics-tool-icon" />
    </button>
  );
}
