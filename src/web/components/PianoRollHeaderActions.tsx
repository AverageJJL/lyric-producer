import React from 'react';

import {PianoRollZoomControls} from './PianoRollZoomControls';

type PianoRollHeaderActionsProps = {
  laneHeight: number;
  pixelsPerBeat: number;
  hasBlock: boolean;
  onLaneHeightChange: (value: number) => void;
  onPixelsPerBeatChange: (value: number) => void;
  onQuantize: () => void;
  onTranspose: (semitones: number) => void;
  onLegato: () => void;
};

export function PianoRollHeaderActions({
  laneHeight,
  pixelsPerBeat,
  hasBlock,
  onLaneHeightChange,
  onPixelsPerBeatChange,
  onQuantize,
  onTranspose,
  onLegato,
}: PianoRollHeaderActionsProps) {
  return (
    <div className="editor-actions">
      <PianoRollZoomControls
        laneHeight={laneHeight}
        pixelsPerBeat={pixelsPerBeat}
        onLaneHeightChange={onLaneHeightChange}
        onPixelsPerBeatChange={onPixelsPerBeatChange}
      />
      <button type="button" disabled={!hasBlock} onClick={onQuantize}>Quantize</button>
      <button type="button" disabled={!hasBlock} onClick={() => onTranspose(-12)}>-12</button>
      <button type="button" disabled={!hasBlock} onClick={() => onTranspose(12)}>+12</button>
      <button type="button" disabled={!hasBlock} onClick={onLegato}>Legato</button>
    </div>
  );
}
