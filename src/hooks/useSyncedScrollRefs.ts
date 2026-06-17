import {useCallback, useRef, type UIEvent, type WheelEvent} from 'react';

/** Timeline owns the vertical scrollbar; sidebar track rows mirror its scroll position. */
export function useSyncedScrollRefs() {
  const sidebarScrollRef = useRef<HTMLDivElement>(null);
  const timelineScrollRef = useRef<HTMLDivElement>(null);

  const syncSidebarToTimeline = useCallback((scrollTop: number) => {
    const sidebar = sidebarScrollRef.current;
    if (sidebar && sidebar.scrollTop !== scrollTop) {
      sidebar.scrollTop = scrollTop;
    }
  }, []);

  const onTimelineScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      syncSidebarToTimeline(event.currentTarget.scrollTop);
    },
    [syncSidebarToTimeline],
  );

  const onSidebarWheel = useCallback((event: WheelEvent<HTMLDivElement>) => {
    const timeline = timelineScrollRef.current;
    if (!timeline) {
      return;
    }
    event.preventDefault();
    timeline.scrollTop += event.deltaY;
  }, []);

  return {
    sidebarScrollRef,
    timelineScrollRef,
    onTimelineScroll,
    onSidebarWheel,
  };
}
