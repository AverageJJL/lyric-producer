import React from 'react';

import {
  MAX_PIANO_ROLL_LANE_HEIGHT,
  MAX_PIANO_ROLL_PIXELS_PER_BEAT,
  MIN_PIANO_ROLL_LANE_HEIGHT,
  MIN_PIANO_ROLL_PIXELS_PER_BEAT,
} from './pianoRollGeometry';

type PianoRollZoomControlsProps = {
  laneHeight: number;
  pixelsPerBeat: number;
  onLaneHeightChange: (laneHeight: number) => void;
  onPixelsPerBeatChange: (pixelsPerBeat: number) => void;
};

export function PianoRollZoomControls({
  laneHeight,
  pixelsPerBeat,
  onLaneHeightChange,
  onPixelsPerBeatChange,
}: PianoRollZoomControlsProps) {
  return (
    <div className="timeline-zoom-sliders" aria-label="Piano roll zoom">
      <label className="timeline-zoom-control">
        <span className="timeline-zoom-icon" aria-hidden="true">↔</span>
        <input
          type="range"
          className="timeline-zoom-slider"
          aria-label="Piano roll horizontal zoom"
          min={MIN_PIANO_ROLL_PIXELS_PER_BEAT}
          max={MAX_PIANO_ROLL_PIXELS_PER_BEAT}
          step={1}
          value={pixelsPerBeat}
          onChange={event => onPixelsPerBeatChange(Number(event.currentTarget.value))}
        />
      </label>
      <label className="timeline-zoom-control">
        <span className="timeline-zoom-icon" aria-hidden="true">↕</span>
        <input
          type="range"
          className="timeline-zoom-slider"
          aria-label="Piano roll vertical zoom"
          min={MIN_PIANO_ROLL_LANE_HEIGHT}
          max={MAX_PIANO_ROLL_LANE_HEIGHT}
          step={1}
          value={laneHeight}
          onChange={event => onLaneHeightChange(Number(event.currentTarget.value))}
        />
      </label>
    </div>
  );
}
