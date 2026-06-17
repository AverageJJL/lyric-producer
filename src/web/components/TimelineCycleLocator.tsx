import React, {useMemo, useRef, useState} from 'react';

import {useDAWStore} from '../../store/useDAWStore';
import {normalizeCycleRange} from '../../transport/cycleRange';
import {snapBeatToGrid, type SnapGrid} from '../../ui/snapGrid';

type TimelineCycleLocatorProps = {
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  snapGrid: SnapGrid;
  beatsPerBar: number;
};

type DragMode = 'start' | 'end';
type DragSession = {pointerId: number; mode: DragMode};

export function TimelineCycleLocator({
  visibleTimelineBeats,
  pixelsPerBeat,
  snapGrid,
  beatsPerBar,
}: TimelineCycleLocatorProps) {
  const layerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<DragSession | null>(null);
  const [draftRange, setDraftRange] = useState<{startBeat: number; endBeat: number} | null>(null);
  const isCycleEnabled = useDAWStore(state => state.isCycleEnabled);
  const cycleStartBeat = useDAWStore(state => state.cycleStartBeat);
  const cycleEndBeat = useDAWStore(state => state.cycleEndBeat);
  const setCycleRange = useDAWStore(state => state.setCycleRange);
  const committedRange = useMemo(
    () => normalizeCycleRange(cycleStartBeat, cycleEndBeat),
    [cycleEndBeat, cycleStartBeat],
  );
  const range = draftRange ?? committedRange;
  const maxBeat = Math.max(1, visibleTimelineBeats);
  const startBeat = Math.min(range.startBeat, maxBeat);
  const endBeat = Math.min(Math.max(range.endBeat, startBeat + 1), maxBeat);

  const beatFromEvent = (event: React.PointerEvent<HTMLElement>): number => {
    const left = layerRef.current?.getBoundingClientRect().left ?? 0;
    const rawBeat = Math.max(0, Math.min(maxBeat, (event.clientX - left) / pixelsPerBeat));
    return snapBeatToGrid(rawBeat, snapGrid, beatsPerBar);
  };

  const previewRange = (mode: DragMode, beat: number) => {
    const next = mode === 'start'
      ? normalizeCycleRange(Math.min(beat, committedRange.endBeat - 1), committedRange.endBeat)
      : normalizeCycleRange(committedRange.startBeat, Math.max(beat, committedRange.startBeat + 1));
    setDraftRange(next);
    return next;
  };

  const startDrag = (mode: DragMode, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== undefined && event.button !== 0) { return; }
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    sessionRef.current = {pointerId: event.pointerId, mode};
    previewRange(mode, beatFromEvent(event));
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) { return; }
    previewRange(session.mode, beatFromEvent(event));
  };

  const finishDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = sessionRef.current;
    if (!session || session.pointerId !== event.pointerId) { return; }
    const next = previewRange(session.mode, beatFromEvent(event));
    setCycleRange(next.startBeat, next.endBeat, {enable: true});
    sessionRef.current = null;
    setDraftRange(null);
  };

  return (
    <div
      ref={layerRef}
      className={`cycle-locator-layer ${isCycleEnabled ? 'active' : ''}`}
      onPointerMove={moveDrag}
      onPointerUp={finishDrag}
      onPointerCancel={() => {
        sessionRef.current = null;
        setDraftRange(null);
      }}>
      <span
        className="cycle-locator-region"
        style={{left: startBeat * pixelsPerBeat, width: (endBeat - startBeat) * pixelsPerBeat}}
      />
      <button
        type="button"
        className="cycle-locator-handle start"
        aria-label="Cycle start locator"
        onPointerDown={event => startDrag('start', event)}
        style={{left: startBeat * pixelsPerBeat}}
      />
      <button
        type="button"
        className="cycle-locator-handle end"
        aria-label="Cycle end locator"
        onPointerDown={event => startDrag('end', event)}
        style={{left: endBeat * pixelsPerBeat}}
      />
    </div>
  );
}
