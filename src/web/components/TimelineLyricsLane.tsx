import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import type {SectionMarker} from '../../store/projectMetadata';
import {TimelineLyricEvidencePopup} from './TimelineLyricEvidencePopup';
import {
  buildLyricEvidenceModel,
  firstLyric,
  hasAnalysis,
  popoverIdFor,
  type TimelineLyricLayout,
} from './timelineLyricEvidence';

type TimelineLyricsLaneProps = {
  sections: SectionMarker[];
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  beatsPerBar?: number;
  onJumpToBeat: (beat: number) => void;
};

type ActiveHover = {sectionId: string; pointerX: number};
type PopupGeometry = {left: number; width: number; arrowLeft: number; isCursor: boolean};

const CURSOR_POPOVER_WIDTH = 260;
const HIDE_DELAY_MS = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pointerXFromEvent(event: React.PointerEvent<HTMLElement>, fallback: number): number {
  if (!Number.isFinite(event.clientX)) return fallback;
  const lane = event.currentTarget.closest('.lyrics-lane');
  const left = lane?.getBoundingClientRect().left ?? 0;
  return event.clientX - left;
}

function popupGeometry(layout: TimelineLyricLayout, hover: ActiveHover, timelineWidth: number): PopupGeometry {
  const isCursor = layout.width < CURSOR_POPOVER_WIDTH;
  const width = isCursor ? CURSOR_POPOVER_WIDTH : layout.width;
  const desiredLeft = isCursor ? hover.pointerX - 24 : layout.startPx;
  const left = clamp(desiredLeft, 0, Math.max(0, timelineWidth - width));
  const anchorX = isCursor ? hover.pointerX : layout.startPx + 18;
  return {
    left,
    width,
    arrowLeft: clamp(anchorX - left, 18, Math.max(18, width - 18)),
    isCursor,
  };
}

export function TimelineLyricsLane({
  sections,
  visibleTimelineBeats,
  pixelsPerBeat,
  beatsPerBar = 4,
  onJumpToBeat,
}: TimelineLyricsLaneProps) {
  const hideTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [activeHover, setActiveHover] = useState<ActiveHover | null>(null);
  const timelineWidth = Math.max(CURSOR_POPOVER_WIDTH, visibleTimelineBeats * pixelsPerBeat);
  const lyricLayouts = useMemo(
    () => sections
      .filter(hasAnalysis)
      .map(section => {
        const startBeat = Math.max(0, section.startBeat);
        const endBeat = Math.min(visibleTimelineBeats, startBeat + Math.max(1, section.lengthBeats));
        const width = Math.max(54, (endBeat - startBeat) * pixelsPerBeat);
        return {
          section,
          startBeat,
          startPx: startBeat * pixelsPerBeat,
          width,
          evidence: buildLyricEvidenceModel(section, sections, beatsPerBar),
        };
      }),
    [beatsPerBar, pixelsPerBeat, sections, visibleTimelineBeats],
  );

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const scheduleHide = useCallback(() => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => setActiveHover(null), HIDE_DELAY_MS);
  }, [clearHideTimer]);

  useEffect(() => clearHideTimer, [clearHideTimer]);

  if (lyricLayouts.length === 0) {
    return null;
  }

  const activeLayout = activeHover
    ? lyricLayouts.find(layout => layout.section.id === activeHover.sectionId)
    : undefined;
  const geometry = activeLayout && activeHover
    ? popupGeometry(activeLayout, activeHover, timelineWidth)
    : null;

  return (
    <div className="lyrics-lane" aria-label="Lyrics lane">
      {lyricLayouts.map(layout => {
        const {section, startPx, width} = layout;
        const tooltipId = popoverIdFor(section.id);
        const isActive = activeHover?.sectionId === section.id;
        const showAt = (pointerX: number) => {
          clearHideTimer();
          setActiveHover({sectionId: section.id, pointerX});
        };
        return (
          <button
            key={section.id}
            type="button"
            className={`lyrics-section-chip${isActive ? ' is-active' : ''}`}
            style={{left: startPx, width}}
            aria-label={`${section.name} lyric analysis`}
            aria-describedby={isActive ? tooltipId : undefined}
            aria-expanded={isActive}
            onFocus={() => showAt(startPx + width / 2)}
            onBlur={scheduleHide}
            onPointerEnter={event => showAt(pointerXFromEvent(event, startPx + width / 2))}
            onPointerMove={event => {
              if (width < CURSOR_POPOVER_WIDTH) {
                showAt(pointerXFromEvent(event, startPx + width / 2));
              }
            }}
            onPointerLeave={scheduleHide}
            onClick={() => onJumpToBeat(Math.max(0, section.startBeat))}>
            <span className="lyrics-chip-section">{section.name}</span>
            <small className="lyrics-chip-preview">{firstLyric(section)}</small>
          </button>
        );
      })}
      {activeLayout && geometry ? (
        <TimelineLyricEvidencePopup
          id={popoverIdFor(activeLayout.section.id)}
          model={activeLayout.evidence}
          left={geometry.left}
          width={geometry.width}
          arrowLeft={geometry.arrowLeft}
          isCursor={geometry.isCursor}
          onPointerEnter={clearHideTimer}
          onPointerLeave={scheduleHide}
        />
      ) : null}
    </div>
  );
}
