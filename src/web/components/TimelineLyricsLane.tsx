import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import type {ChordMetadata, ScaleMetadata, SectionMarker} from '../../store/projectMetadata';
import type {LyricDocument, LyricSection} from '../../store/lyrics';
import {TimelineLyricEvidencePopup} from './TimelineLyricEvidencePopup';
import {
  buildAuthoredLyricEvidenceModel,
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
  authoredLyrics?: LyricDocument;
  showAuthoredLyrics?: boolean;
  scale?: ScaleMetadata | null;
  chord?: ChordMetadata | null;
};

type ActivePopup = {id: string; pointerX: number};
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

function popupGeometry(layout: TimelineLyricLayout, active: ActivePopup, timelineWidth: number): PopupGeometry {
  const isCursor = layout.width < CURSOR_POPOVER_WIDTH;
  const width = isCursor ? CURSOR_POPOVER_WIDTH : layout.width;
  const desiredLeft = isCursor ? active.pointerX - 24 : layout.startPx;
  const left = clamp(desiredLeft, 0, Math.max(0, timelineWidth - width));
  const anchorX = isCursor ? active.pointerX : layout.startPx + 18;
  return {
    left,
    width,
    arrowLeft: clamp(anchorX - left, 18, Math.max(18, width - 18)),
    isCursor,
  };
}

function lyricSectionEnd(section: LyricSection, sections: LyricSection[], index: number, fallback: number): number {
  return section.endBeat ?? sections.slice(index + 1).find(item => item.startBeat !== undefined)?.startBeat ?? fallback;
}

function authoredPreview(section: LyricSection): string {
  return section.lines.find(line => line.text.trim().length > 0)?.text.trim() ?? 'Untimed lyrics';
}

function hasAuthoredText(section: LyricSection): boolean {
  return section.lines.some(line => line.text.trim().length > 0);
}

function authoredContext(list: LyricSection[], index: number) {
  return [list[index - 1], list[index + 1]]
    .filter((section): section is LyricSection => Boolean(section))
    .map(section => ({sectionName: section.name, lines: section.lines}));
}

export function TimelineLyricsLane({
  sections,
  authoredLyrics,
  showAuthoredLyrics = true,
  visibleTimelineBeats,
  pixelsPerBeat,
  beatsPerBar = 4,
  onJumpToBeat,
  scale,
  chord,
}: TimelineLyricsLaneProps) {
  const hideTimerRef = useRef<number | null>(null);
  const [activeHover, setActiveHover] = useState<ActivePopup | null>(null);
  const [pinnedPopup, setPinnedPopup] = useState<ActivePopup | null>(null);
  const timelineWidth = Math.max(CURSOR_POPOVER_WIDTH, visibleTimelineBeats * pixelsPerBeat);
  const lyricLayouts = useMemo(
    (): TimelineLyricLayout[] => sections
      .filter(hasAnalysis)
      .map(section => {
        const startBeat = Math.max(0, section.startBeat);
        const endBeat = Math.min(visibleTimelineBeats, startBeat + Math.max(1, section.lengthBeats));
        const width = Math.max(54, (endBeat - startBeat) * pixelsPerBeat);
        return {
          id: section.id,
          name: section.name,
          startBeat,
          startPx: startBeat * pixelsPerBeat,
          width,
          preview: firstLyric(section),
          ariaLabel: `${section.name} lyric analysis`,
          evidence: buildLyricEvidenceModel(section, sections, beatsPerBar, {scale, chord}),
        };
      }),
    [beatsPerBar, chord, pixelsPerBeat, scale, sections, visibleTimelineBeats],
  );
  const analysisSectionIds = useMemo(() => new Set(lyricLayouts.map(layout => layout.id)), [lyricLayouts]);
  const authoredLayouts = useMemo(
    (): TimelineLyricLayout[] => {
      if (!showAuthoredLyrics) return [];
      const layouts: TimelineLyricLayout[] = [];
      (authoredLyrics?.sections ?? []).forEach((section, index, list) => {
        if (section.startBeat === undefined || analysisSectionIds.has(section.id) || !hasAuthoredText(section)) return;
        const startBeat = Math.max(0, section.startBeat);
        const endBeat = Math.min(visibleTimelineBeats, lyricSectionEnd(section, list, index, visibleTimelineBeats));
        layouts.push({
          id: `authored-${section.id}`,
          name: section.name,
          startBeat,
          startPx: startBeat * pixelsPerBeat,
          width: Math.max(54, Math.max(1, endBeat - startBeat) * pixelsPerBeat),
          preview: authoredPreview(section),
          ariaLabel: `${section.name} authored lyrics`,
          className: 'authored',
          evidence: buildAuthoredLyricEvidenceModel(section, endBeat, beatsPerBar, {scale, chord}, authoredContext(list, index)),
        });
      });
      return layouts;
    },
    [analysisSectionIds, authoredLyrics, beatsPerBar, chord, pixelsPerBeat, scale, showAuthoredLyrics, visibleTimelineBeats],
  );
  const allLayouts = useMemo(() => [...authoredLayouts, ...lyricLayouts], [authoredLayouts, lyricLayouts]);

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
  useEffect(() => {
    if (!pinnedPopup) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setPinnedPopup(null);
        setActiveHover(null);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [pinnedPopup]);

  if (allLayouts.length === 0) {
    return null;
  }

  const activePopup = activeHover ?? pinnedPopup;
  const activeLayout = activePopup ? allLayouts.find(layout => layout.id === activePopup.id) : undefined;
  const geometry = activeLayout && activePopup
    ? popupGeometry(activeLayout, activePopup, timelineWidth)
    : null;
  const isPinned = Boolean(activeLayout && pinnedPopup?.id === activeLayout.id);

  return (
    <div className="lyrics-lane" aria-label="Lyrics lane">
      {allLayouts.map(layout => {
        const {id, name, startBeat, startPx, width} = layout;
        const tooltipId = popoverIdFor(id);
        const isActive = activePopup?.id === id;
        const showAt = (pointerX: number) => {
          clearHideTimer();
          setActiveHover({id, pointerX});
        };
        return (
          <button
            key={id}
            type="button"
            className={`lyrics-section-chip${layout.className ? ` ${layout.className}` : ''}${isActive ? ' is-active' : ''}`}
            style={{left: startPx, width}}
            aria-label={layout.ariaLabel}
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
            onClick={() => onJumpToBeat(Math.max(0, startBeat))}>
            <span className="lyrics-chip-section">{name}</span>
            <small className="lyrics-chip-preview">{layout.preview}</small>
          </button>
        );
      })}
      {activeLayout && geometry ? (
        <TimelineLyricEvidencePopup
          id={popoverIdFor(activeLayout.id)}
          model={activeLayout.evidence}
          left={geometry.left}
          width={geometry.width}
          arrowLeft={geometry.arrowLeft}
          isCursor={geometry.isCursor}
          isPinned={isPinned}
          onPin={() => activePopup && setPinnedPopup(isPinned ? null : {...activePopup})}
          onClose={() => {
            setPinnedPopup(null);
            setActiveHover(null);
          }}
          onPointerEnter={clearHideTimer}
          onPointerLeave={scheduleHide}
        />
      ) : null}
    </div>
  );
}
