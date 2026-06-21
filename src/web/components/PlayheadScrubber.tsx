import React, {useMemo, useRef, useState} from 'react';

import {
  createPlayheadScrubHandlers,
  type PlayheadScrubSession,
} from '../../ui/playheadScrubPointer';
import {useVisualPlaybackBeat} from '../../hooks/useVisualPlaybackBeat';
import {beatsPerBarForTimeSignature} from '../../store/projectMetadata';
import {useDAWStore} from '../../store/useDAWStore';

const SCRUBBER_HIT_WIDTH = 24;

type PlayheadScrubberProps = {
  contentHeight: number;
  getTimelineClientX: () => number;
  maxTimelineBeat: number;
  pixelsPerBeat: number;
};

/** Draggable playhead with a wider invisible hit area than the visual line. */
export function PlayheadScrubber({
  contentHeight,
  getTimelineClientX,
  maxTimelineBeat,
  pixelsPerBeat,
}: PlayheadScrubberProps) {
  const setPlayheadBeat = useDAWStore(state => state.setPlayheadBeat);
  const beatsPerBar = useDAWStore(state => beatsPerBarForTimeSignature(state.timeSignature));
  const visualPlayheadBeat = useVisualPlaybackBeat(maxTimelineBeat);
  const visualPlayheadBeatRef = useRef(visualPlayheadBeat);
  const [isDragging, setIsDragging] = useState(false);
  const sessionRef = useRef<PlayheadScrubSession | null>(null);

  visualPlayheadBeatRef.current = visualPlayheadBeat;

  const pointerHandlers = useMemo(
    () =>
      createPlayheadScrubHandlers({
        getTimelineClientX,
        getPlayheadBeat: () => visualPlayheadBeatRef.current,
        getMaxTimelineBeat: () => maxTimelineBeat,
        pixelsPerBeat,
        barSnap: {beatsPerBar},
        sessionRef,
        onScrubStart: () => setIsDragging(true),
        onScrubEnd: () => setIsDragging(false),
        onScrubBeat: (beat, options) => {
          setPlayheadBeat(beat, {
            pauseIfPlaying: true,
            syncTransport: options.syncTransport,
          });
        },
      }),
    [beatsPerBar, getTimelineClientX, maxTimelineBeat, pixelsPerBeat, setPlayheadBeat],
  );

  const capturePointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointerHandlers.onPointerDown(event);
  };

  const releasePointer = (
    event: React.PointerEvent<HTMLDivElement>,
    finish: (event: React.PointerEvent<HTMLDivElement>) => void,
  ) => {
    event.stopPropagation();
    finish(event);
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  return (
    <div
      className={`playhead-hit-area ${isDragging ? 'dragging' : ''}`}
      data-testid="playhead-scrubber"
      onPointerDown={capturePointer}
      onPointerMove={pointerHandlers.onPointerMove}
      onPointerUp={event => releasePointer(event, pointerHandlers.onPointerUp)}
      onPointerCancel={event => releasePointer(event, pointerHandlers.onPointerCancel)}
      style={{
        left: 0,
        height: contentHeight,
        transform: `translate3d(${visualPlayheadBeat * pixelsPerBeat - SCRUBBER_HIT_WIDTH / 2}px, 0, 0)`,
        width: SCRUBBER_HIT_WIDTH,
      }}>
      <div className="playhead" />
    </div>
  );
}
