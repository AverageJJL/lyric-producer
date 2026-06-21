import React, {useMemo} from 'react';

import {
  beatsPerBarForTimeSignature,
  type ChordMetadata,
  type ScaleMetadata,
  type SectionMarker,
  type TimeSignature,
} from '../../store/projectMetadata';
import type {LyricDocument} from '../../store/lyrics';
import type {MeterMapEvent, TempoMapEvent} from '../../transport/tempoMap';
import type {SnapGrid} from '../../ui/snapGrid';
import {buildTimelineRulerModel} from '../../ui/timelineRulerMap';
import {TimelineCycleLocator} from './TimelineCycleLocator';
import {TimelineLyricsLane} from './TimelineLyricsLane';
import {TimelineMarkerLane} from './TimelineMarkerLane';

type TimelineRulerLayerProps = {
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  playheadBeat: number;
  snapGrid: SnapGrid;
  timeSignature: TimeSignature;
  meterMap: MeterMapEvent[];
  tempoMap: TempoMapEvent[];
  sections: SectionMarker[];
  authoredLyrics?: LyricDocument;
  showAuthoredLyricsLane?: boolean;
  scale?: ScaleMetadata | null;
  chord?: ChordMetadata | null;
  onRulerPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSectionsChange: (sections: SectionMarker[]) => void;
  onJumpToBeat: (beat: number) => void;
};

function markerAriaLabel(marker: {type: 'tempo' | 'meter'; label: string; beat: number}): string {
  const beatLabel = Math.floor(Math.max(0, marker.beat)) + 1;
  return marker.type === 'tempo'
    ? `Tempo ${marker.label} BPM at beat ${beatLabel}`
    : `Meter ${marker.label} at beat ${beatLabel}`;
}

export function TimelineRulerLayer({
  visibleTimelineBeats,
  pixelsPerBeat,
  playheadBeat,
  snapGrid,
  timeSignature,
  meterMap,
  tempoMap,
  sections,
  authoredLyrics,
  showAuthoredLyricsLane = true,
  scale,
  chord,
  onRulerPointerDown,
  onSectionsChange,
  onJumpToBeat,
}: TimelineRulerLayerProps) {
  const beatsPerBar = beatsPerBarForTimeSignature(timeSignature);
  const model = useMemo(
    () => buildTimelineRulerModel({
      visibleTimelineBeats,
      snapGrid,
      timeSignature,
      meterMap,
      tempoMap,
    }),
    [meterMap, snapGrid, tempoMap, timeSignature, visibleTimelineBeats],
  );

  return (
    <>
      <div className="ruler-row" onPointerDown={onRulerPointerDown}>
        {model.rulerTicks.map(tick => (
          <span
            key={`ruler-${tick.beat}`}
            className={`ruler-tick ${tick.isBar ? 'bar' : 'beat'}`}
            style={{left: tick.beat * pixelsPerBeat}}>
            {tick.label ? <span>{tick.label}</span> : null}
          </span>
        ))}
        {model.mapMarkers.map(marker => (
          <span
            key={`${marker.type}-${marker.id}`}
            aria-label={markerAriaLabel(marker)}
            className={`timeline-map-marker ${marker.type} ${marker.isRamp ? 'ramp' : ''}`}
            style={{left: marker.beat * pixelsPerBeat}}>
            {marker.label}
          </span>
        ))}
      </div>
      <TimelineCycleLocator
        visibleTimelineBeats={visibleTimelineBeats}
        pixelsPerBeat={pixelsPerBeat}
        snapGrid={snapGrid}
        beatsPerBar={beatsPerBar}
      />
      <TimelineLyricsLane
        sections={sections}
        authoredLyrics={authoredLyrics}
        showAuthoredLyrics={showAuthoredLyricsLane}
        scale={scale}
        chord={chord}
        visibleTimelineBeats={visibleTimelineBeats}
        pixelsPerBeat={pixelsPerBeat}
        beatsPerBar={beatsPerBar}
        onJumpToBeat={onJumpToBeat}
      />
      <TimelineMarkerLane
        sections={sections}
        visibleTimelineBeats={visibleTimelineBeats}
        pixelsPerBeat={pixelsPerBeat}
        snapGrid={snapGrid}
        beatsPerBar={beatsPerBar}
        playheadBeat={playheadBeat}
        onSectionsChange={onSectionsChange}
        onJumpToBeat={onJumpToBeat}
      />
    </>
  );
}
