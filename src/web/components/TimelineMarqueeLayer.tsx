import React, {useRef, useState} from 'react';

import {
  clipIdsInMarquee,
  commitMarqueeClipSelection,
} from '../../arrangement/clipMarqueeSelection';
import type {DAWBlock} from '../../store/useDAWStore';
import {RULER_HEIGHT} from '../../ui/timelineLayout';
import {
  trackIndexAtY,
  timelineTrackHitRows,
  type TimelineTrackLaneLayout,
} from '../../ui/timelineTrackLanes';

type TimelineMarqueeLayerProps = {
  blocks: DAWBlock[];
  trackIds: string[];
  trackLaneLayout: TimelineTrackLaneLayout;
  timelineWidth: number;
  pixelsPerBeat: number;
  disabled: boolean;
  onClearSelection: () => void;
};

type MarqueeDrag = {
  originX: number;
  originY: number;
  currentX: number;
  currentY: number;
  additive: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function dragRect(drag: MarqueeDrag) {
  const left = Math.min(drag.originX, drag.currentX);
  const top = Math.min(drag.originY, drag.currentY);
  return {
    left,
    top,
    width: Math.abs(drag.currentX - drag.originX),
    height: Math.abs(drag.currentY - drag.originY),
  };
}

export function TimelineMarqueeLayer({
  blocks,
  trackIds,
  trackLaneLayout,
  timelineWidth,
  pixelsPerBeat,
  disabled,
  onClearSelection,
}: TimelineMarqueeLayerProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<MarqueeDrag | null>(null);
  const rowAreaHeight = trackLaneLayout.rowAreaHeight;

  const pointFromEvent = (event: React.PointerEvent<HTMLElement>) => {
    const rect = layerRef.current?.getBoundingClientRect();
    return {
      x: clamp(event.clientX - (rect?.left ?? 0), 0, timelineWidth),
      y: clamp(event.clientY - (rect?.top ?? 0), 0, rowAreaHeight),
    };
  };

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled || (event.button !== undefined && event.button !== 0)) {
      return;
    }
    event.preventDefault();
    const point = pointFromEvent(event);
    setDrag({
      originX: point.x,
      originY: point.y,
      currentX: point.x,
      currentY: point.y,
      additive: Boolean(event.shiftKey || event.metaKey || event.ctrlKey),
    });
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const updateDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (!drag) {
      return;
    }
    const point = pointFromEvent(event);
    setDrag({...drag, currentX: point.x, currentY: point.y});
  };

  const finishDrag = () => {
    if (!drag) {
      return;
    }
    const rect = dragRect(drag);
    setDrag(null);
    if (rect.width < 4 && rect.height < 4) {
      onClearSelection();
      return;
    }

    const ids = clipIdsInMarquee(blocks, trackIds, {
      startBeat: rect.left / pixelsPerBeat,
      endBeat: (rect.left + rect.width) / pixelsPerBeat,
      startRow: trackIndexAtY(trackLaneLayout, rect.top),
      endRow: trackIndexAtY(trackLaneLayout, rect.top + rect.height),
    });
    commitMarqueeClipSelection(ids, drag.additive);
  };

  const rect = drag ? dragRect(drag) : null;

  return (
    <div
      ref={layerRef}
      className="timeline-marquee-layer"
      aria-label="Marquee selection area"
      style={{top: RULER_HEIGHT, width: timelineWidth, height: rowAreaHeight}}>
      {timelineTrackHitRows(trackLaneLayout).map(row => (
        <button
          key={row.key}
          type="button"
          className="timeline-marquee-hit-row"
          aria-label={`Timeline row ${row.index + 1}`}
          onPointerDown={startDrag}
          onPointerMove={updateDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          style={{top: row.offsetTop, width: timelineWidth, height: row.height}}
        />
      ))}
      {rect ? <span className="timeline-marquee-rect" style={rect} /> : null}
    </div>
  );
}
