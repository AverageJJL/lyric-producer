import {useEffect, useState, type RefObject} from 'react';

import {timelineSurfaceHeight} from '../ui/timelineSurfaceHeight';

export function useTimelineSurfaceHeight(
  scrollRef: RefObject<HTMLDivElement | null>,
  contentHeight: number,
): number {
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return undefined;
    }

    const updateViewportHeight = () => {
      setViewportHeight(element.clientHeight);
    };

    updateViewportHeight();
    if (!window.ResizeObserver) {
      window.addEventListener('resize', updateViewportHeight);
      return () => window.removeEventListener('resize', updateViewportHeight);
    }

    const resizeObserver = new window.ResizeObserver(updateViewportHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [scrollRef]);

  return timelineSurfaceHeight(contentHeight, viewportHeight);
}
