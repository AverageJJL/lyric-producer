import React from 'react';

import {
  MAX_TIMELINE_PIXELS_PER_BEAT,
  MAX_TIMELINE_ROW_HEIGHT,
  MIN_TIMELINE_PIXELS_PER_BEAT,
  MIN_TIMELINE_ROW_HEIGHT,
} from '../../ui/timelineZoom';
import {
  SNAP_GRID_OPTIONS,
  normalizeSnapGrid,
  type SnapGrid,
} from '../../ui/snapGrid';

type TimelineToolbarProps = {
  snapGrid: SnapGrid;
  pixelsPerBeat: number;
  rowHeight: number;
  onAddMarker: () => void;
  onPixelsPerBeatChange: (pixelsPerBeat: number) => void;
  onFitProject: () => void;
  onRowHeightChange: (rowHeight: number) => void;
  onSnapGridChange: (snapGrid: SnapGrid) => void;
};

export function TimelineToolbar({
  snapGrid,
  pixelsPerBeat,
  rowHeight,
  onAddMarker,
  onPixelsPerBeatChange,
  onFitProject,
  onRowHeightChange,
  onSnapGridChange,
}: TimelineToolbarProps) {
  return (
    <div className="timeline-toolbar">
      <div className="timeline-toolbar-actions">
        <button type="button" className="timeline-tool-button" aria-label="Add Marker" onClick={onAddMarker}>
          +Marker
        </button>
      </div>
      <div className="timeline-toolbar-meta">
        <span className="timeline-toolbar-group snap-toolbar-group">
          <label className="snap-grid-control">
            <span>Snap</span>
            <select
              aria-label="Snap grid"
              value={snapGrid}
              onChange={event => onSnapGridChange(normalizeSnapGrid(event.currentTarget.value))}>
              {SNAP_GRID_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </span>
        <span className="timeline-toolbar-group">
          <button type="button" className="timeline-tool-button timeline-fit-button" aria-label="Fit" onClick={onFitProject}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" aria-hidden="true">
              <path
                d="M8 8 h84 M8 92 h84 M50 20 v60 M35 35 l15 -15 l15 15 M35 65 l15 15 l15 -15"
                fill="none"
                stroke="currentColor"
                strokeWidth="5"
                strokeLinecap="butt"
                strokeLinejoin="miter"
              />
            </svg>
          </button>
        </span>
        <div className="timeline-zoom-sliders" aria-label="Timeline zoom">
          <label className="timeline-zoom-control">
            <span className="timeline-zoom-icon" aria-hidden="true">↔</span>
            <input
              type="range"
              className="timeline-zoom-slider"
              aria-label="Timeline horizontal zoom"
              min={MIN_TIMELINE_PIXELS_PER_BEAT}
              max={MAX_TIMELINE_PIXELS_PER_BEAT}
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
              aria-label="Track height"
              min={MIN_TIMELINE_ROW_HEIGHT}
              max={MAX_TIMELINE_ROW_HEIGHT}
              step={1}
              value={rowHeight}
              onChange={event => onRowHeightChange(Number(event.currentTarget.value))}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
