import {useEffect, type MutableRefObject, type RefObject} from 'react';

export const TIMELINE_RETURN_TO_ZERO_EVENT = 'musicapp:return-to-zero';

type TimelineOriginScrollOptions = {
  horizontalScrollRef: RefObject<HTMLDivElement | null>;
  followPlayheadRef: MutableRefObject<boolean>;
  isPlaying: boolean;
  isRecording: boolean;
  playheadBeat: number;
};

function scrollTimelineHome(
  horizontalScrollRef: RefObject<HTMLDivElement | null>,
  followPlayheadRef: MutableRefObject<boolean>,
) {
  followPlayheadRef.current = true;
  if (horizontalScrollRef.current) {
    horizontalScrollRef.current.scrollLeft = 0;
  }
}

export function useTimelineOriginScroll({
  horizontalScrollRef,
  followPlayheadRef,
  isPlaying,
  isRecording,
  playheadBeat,
}: TimelineOriginScrollOptions) {
  useEffect(() => {
    if (!isPlaying && !isRecording && playheadBeat === 0) {
      scrollTimelineHome(horizontalScrollRef, followPlayheadRef);
    }
  }, [followPlayheadRef, horizontalScrollRef, isPlaying, isRecording, playheadBeat]);

  useEffect(() => {
    const onReturnToZero = () => scrollTimelineHome(horizontalScrollRef, followPlayheadRef);
    window.addEventListener(TIMELINE_RETURN_TO_ZERO_EVENT, onReturnToZero);
    return () => window.removeEventListener(TIMELINE_RETURN_TO_ZERO_EVENT, onReturnToZero);
  }, [followPlayheadRef, horizontalScrollRef]);
}
