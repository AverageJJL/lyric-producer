import type {SectionMarker} from '../store/projectMetadata';
import {
  DEFAULT_SNAP_GRID,
  snapBeatToGrid,
  type SnapGrid,
} from './snapGrid';

export type SectionMarkerDragMode = 'move' | 'resize-start' | 'resize-end';

type SectionMarkerDragInput = {
  sections: SectionMarker[];
  sectionId: string;
  mode: SectionMarkerDragMode;
  pointerBeat: number;
  pointerOffsetBeats?: number;
  snapGrid?: SnapGrid;
  beatsPerBar?: number;
  visibleTimelineBeats: number;
};

const MIN_SECTION_LENGTH_BEATS = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function cleanBeat(value: number): number {
  return Number(value.toFixed(6));
}

function snappedBeat(input: SectionMarkerDragInput, beat: number): number {
  return snapBeatToGrid(
    beat,
    input.snapGrid ?? DEFAULT_SNAP_GRID,
    input.beatsPerBar,
  );
}

function moveSection(
  section: SectionMarker,
  input: SectionMarkerDragInput,
): SectionMarker {
  const lengthBeats = Math.max(MIN_SECTION_LENGTH_BEATS, section.lengthBeats);
  const maxStart = Math.max(0, input.visibleTimelineBeats - lengthBeats);
  const startBeat = clamp(
    snappedBeat(input, input.pointerBeat - (input.pointerOffsetBeats ?? 0)),
    0,
    maxStart,
  );

  return {
    ...section,
    startBeat: cleanBeat(startBeat),
    lengthBeats: cleanBeat(lengthBeats),
  };
}

function resizeSectionStart(
  section: SectionMarker,
  input: SectionMarkerDragInput,
): SectionMarker {
  const fixedEndBeat =
    section.startBeat + Math.max(MIN_SECTION_LENGTH_BEATS, section.lengthBeats);
  const startBeat = clamp(
    snappedBeat(input, input.pointerBeat),
    0,
    Math.max(0, fixedEndBeat - MIN_SECTION_LENGTH_BEATS),
  );

  return {
    ...section,
    startBeat: cleanBeat(startBeat),
    lengthBeats: cleanBeat(fixedEndBeat - startBeat),
  };
}

function resizeSectionEnd(
  section: SectionMarker,
  input: SectionMarkerDragInput,
): SectionMarker {
  const minEndBeat = section.startBeat + MIN_SECTION_LENGTH_BEATS;
  const maxEndBeat = Math.max(minEndBeat, input.visibleTimelineBeats);
  const endBeat = clamp(
    snappedBeat(input, input.pointerBeat),
    minEndBeat,
    maxEndBeat,
  );

  return {
    ...section,
    lengthBeats: cleanBeat(endBeat - section.startBeat),
  };
}

export function sectionMarkersAfterPointerDrag(
  input: SectionMarkerDragInput,
): SectionMarker[] {
  return input.sections.map(section => {
    if (section.id !== input.sectionId) {
      return section;
    }

    if (input.mode === 'resize-start') {
      return resizeSectionStart(section, input);
    }

    if (input.mode === 'resize-end') {
      return resizeSectionEnd(section, input);
    }

    return moveSection(section, input);
  });
}
