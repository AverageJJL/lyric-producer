import {PIXELS_PER_BEAT, ROW_HEIGHT} from './timelineLayout';
import type {DAWBlock} from '../store/useDAWStore';

export const MIN_TIMELINE_PIXELS_PER_BEAT = 24;
export const MAX_TIMELINE_PIXELS_PER_BEAT = 128;
export const TIMELINE_ZOOM_STEP = 12;
export const MIN_TIMELINE_ROW_HEIGHT = 64;
export const MAX_TIMELINE_ROW_HEIGHT = 144;
export const TIMELINE_ROW_ZOOM_STEP = 16;

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function clampTimelinePixelsPerBeat(value: number): number {
  return Math.min(
    MAX_TIMELINE_PIXELS_PER_BEAT,
    Math.max(MIN_TIMELINE_PIXELS_PER_BEAT, Math.round(finiteOr(value, PIXELS_PER_BEAT))),
  );
}

export function zoomTimelinePixelsPerBeat(
  current: number,
  direction: 'in' | 'out',
): number {
  const delta = direction === 'in' ? TIMELINE_ZOOM_STEP : -TIMELINE_ZOOM_STEP;
  return clampTimelinePixelsPerBeat(current + delta);
}

export function fitTimelinePixelsPerBeat(
  visibleTimelineBeats: number,
  viewportWidth: number,
): number {
  if (visibleTimelineBeats <= 0 || viewportWidth <= 0) {
    return PIXELS_PER_BEAT;
  }
  return clampTimelinePixelsPerBeat(viewportWidth / visibleTimelineBeats);
}

export function clampTimelineRowHeight(value: number): number {
  return Math.min(
    MAX_TIMELINE_ROW_HEIGHT,
    Math.max(MIN_TIMELINE_ROW_HEIGHT, Math.round(finiteOr(value, ROW_HEIGHT))),
  );
}

export function zoomTimelineRowHeight(current: number, direction: 'in' | 'out'): number {
  const delta = direction === 'in' ? TIMELINE_ROW_ZOOM_STEP : -TIMELINE_ROW_ZOOM_STEP;
  return clampTimelineRowHeight(current + delta);
}

export type TimelineSelectionFit = {
  pixelsPerBeat: number;
  scrollLeft: number;
};

export function fitSelectedTimelineBlocks(
  blocks: DAWBlock[],
  selectedBlockId: string | null,
  selectedBlockIds: string[],
  viewportWidth: number,
): TimelineSelectionFit | null {
  const selectedIds = selectedBlockIds.length > 0
    ? selectedBlockIds
    : selectedBlockId
      ? [selectedBlockId]
      : [];
  const selected = blocks.filter(block => selectedIds.includes(block.id));
  if (selected.length === 0) {
    return null;
  }

  const startBeat = Math.min(...selected.map(block => block.startBeat));
  const endBeat = Math.max(...selected.map(block => block.startBeat + block.lengthBeats));
  const pixelsPerBeat = fitTimelinePixelsPerBeat(Math.max(1, endBeat - startBeat), viewportWidth);
  return {pixelsPerBeat, scrollLeft: startBeat * pixelsPerBeat};
}
