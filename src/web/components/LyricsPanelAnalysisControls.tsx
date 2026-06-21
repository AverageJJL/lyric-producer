import React from 'react';

type LyricsPanelAnalysisControlsProps = {
  areColoredSectionsHidden: boolean;
  onColoredSectionsHiddenChange?: (hidden: boolean) => void;
  onRemoveLyricAnalysis: () => void;
};

export function LyricsPanelAnalysisControls({
  areColoredSectionsHidden,
  onColoredSectionsHiddenChange,
  onRemoveLyricAnalysis,
}: LyricsPanelAnalysisControlsProps) {
  return (
    <>
      <label className="lyrics-panel-toggle">
        <input
          type="checkbox"
          checked={areColoredSectionsHidden}
          onChange={event => onColoredSectionsHiddenChange?.(event.target.checked)}
        />
        <span>Hide coloured sections</span>
      </label>
      <button
        type="button"
        className="lyrics-remove-analysis-button"
        aria-label="Remove lyric analysis"
        title="Clear lyrics, lyric analysis, and section markers. Undo restores them."
        data-tooltip="Clear lyrics and markers"
        onClick={onRemoveLyricAnalysis}>
        <span>Remove lyric analysis</span>
      </button>
    </>
  );
}
