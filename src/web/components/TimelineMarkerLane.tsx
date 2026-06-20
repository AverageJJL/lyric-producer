import React, {useMemo, useRef, useState} from 'react';

import {splitSectionAtBeat} from '../../arrangement/sectionEditCommands';
import type {SectionMarker} from '../../store/projectMetadata';
import {
  sectionMarkersAfterPointerDrag,
  type SectionMarkerDragMode,
} from '../../ui/sectionMarkerDrag';
import type {SnapGrid} from '../../ui/snapGrid';

type TimelineMarkerLaneProps = {
  sections: SectionMarker[];
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  snapGrid: SnapGrid;
  beatsPerBar: number;
  playheadBeat: number;
  onSectionsChange: (sections: SectionMarker[]) => void;
  onJumpToBeat: (beat: number) => void;
};

type MarkerDragSession = {
  pointerId: number;
  sectionId: string;
  mode: SectionMarkerDragMode;
  pointerOffsetBeats: number;
  startSections: SectionMarker[];
};

export function TimelineMarkerLane({
  sections,
  visibleTimelineBeats,
  pixelsPerBeat,
  snapGrid,
  beatsPerBar,
  playheadBeat,
  onSectionsChange,
  onJumpToBeat,
}: TimelineMarkerLaneProps) {
  const laneRef = useRef<HTMLDivElement>(null);
  const dragSessionRef = useRef<MarkerDragSession | null>(null);
  const didDragRef = useRef(false);
  const [previewSections, setPreviewSections] = useState<SectionMarker[] | null>(null);
  const displaySections = previewSections ?? sections;

  const markerLayouts = useMemo(
    () =>
      displaySections.map(section => {
        const startBeat = Math.max(0, section.startBeat);
        const endBeat = Math.min(
          visibleTimelineBeats,
          startBeat + Math.max(1, section.lengthBeats),
        );
        return {
          section,
          startBeat,
          width: Math.max(28, (endBeat - startBeat) * pixelsPerBeat),
        };
      }),
    [displaySections, pixelsPerBeat, visibleTimelineBeats],
  );

  if (displaySections.length === 0) {
    return null;
  }

  const beatFromClientX = (clientX: number): number => {
    const left = laneRef.current?.getBoundingClientRect().left ?? 0;
    return (clientX - left) / pixelsPerBeat;
  };

  const previewDrag = (clientX: number): SectionMarker[] | null => {
    const session = dragSessionRef.current;
    if (!session) {
      return null;
    }
    const nextSections = sectionMarkersAfterPointerDrag({
      sections: session.startSections,
      sectionId: session.sectionId,
      mode: session.mode,
      pointerBeat: beatFromClientX(clientX),
      pointerOffsetBeats: session.pointerOffsetBeats,
      snapGrid,
      beatsPerBar,
      visibleTimelineBeats,
    });
    setPreviewSections(nextSections);
    return nextSections;
  };

  const startDrag = (
    event: React.PointerEvent<HTMLElement>,
    section: SectionMarker,
    mode: SectionMarkerDragMode,
  ) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const pointerBeat = beatFromClientX(event.clientX);
    didDragRef.current = false;
    dragSessionRef.current = {
      pointerId: event.pointerId,
      sectionId: section.id,
      mode,
      pointerOffsetBeats: mode === 'move' ? pointerBeat - section.startBeat : 0,
      startSections: sections.map(item => ({...item})),
    };
    setPreviewSections(sections);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    didDragRef.current = true;
    previewDrag(event.clientX);
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    event.stopPropagation();
    const nextSections = previewDrag(event.clientX);
    dragSessionRef.current = null;
    setPreviewSections(null);
    if (nextSections) {
      onSectionsChange(nextSections);
    }
  };

  const handleMarkerClick = (section: SectionMarker) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    onJumpToBeat(Math.max(0, section.startBeat));
  };

  const handleSplitSection = (section: SectionMarker) => {
    if (didDragRef.current) {
      didDragRef.current = false;
      return;
    }
    splitSectionAtBeat(section.id, playheadBeat);
  };

  const markerTitle = (section: SectionMarker): string => {
    if (!section.analysis) {
      return section.name;
    }
    return [
      section.name,
      `Mood: ${section.analysis.mood}`,
      `Key: ${section.analysis.key}`,
      section.analysis.bpm
        ? `BPM: ${section.analysis.bpm} (${section.analysis.bpmSource ?? 'unknown source'})`
        : null,
      `Meaning: ${section.analysis.meaning}`,
      section.analysis.productionDrivers?.length
        ? `Created by: ${section.analysis.productionDrivers.join(', ')}`
        : `Created by: ${section.analysis.productionCue}`,
      section.analysis.producerInsight
        ? `Producer move: ${section.analysis.producerInsight.arrangementMove}`
        : null,
      section.analysis.producerInsight
        ? `Mix focus: ${section.analysis.producerInsight.mixFocus}`
        : null,
    ].filter(Boolean).join('\n');
  };

  return (
    <div ref={laneRef} className="marker-lane" aria-label="Marker lane">
      {markerLayouts.map(({section, startBeat, width}) => {
        const isDragging = dragSessionRef.current?.sectionId === section.id;
        return (
          <div
            key={section.id}
            className={`marker-chip ${isDragging ? 'dragging' : ''}`}
            onPointerMove={handlePointerMove}
            onPointerUp={finishDrag}
            onPointerCancel={finishDrag}
            style={{left: startBeat * pixelsPerBeat, width}}
            title={markerTitle(section)}>
            <button
              type="button"
              className="marker-resize-handle left"
              aria-label={`Resize marker start ${section.name}`}
              onPointerDown={event => startDrag(event, section, 'resize-start')}
            />
            <button
              type="button"
              className="marker-drag-button"
              aria-label={`Move marker ${section.name}`}
              onClick={() => handleMarkerClick(section)}
              onPointerDown={event => startDrag(event, section, 'move')}>
              {section.name}
            </button>
            <button
              type="button"
              className="marker-drag-button"
              aria-label={`Split section ${section.name}`}
              onPointerDown={event => event.stopPropagation()}
              onClick={() => handleSplitSection(section)}
              style={{cursor: 'crosshair', textAlign: 'center'}}>
              S
            </button>
            <button
              type="button"
              className="marker-resize-handle right"
              aria-label={`Resize marker end ${section.name}`}
              onPointerDown={event => startDrag(event, section, 'resize-end')}
            />
          </div>
        );
      })}
    </div>
  );
}
