import {useCallback, useEffect, useRef} from 'react';

type ScrollBehaviorMode = 'auto' | 'smooth';

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function clampScrollTop(container: HTMLElement, top: number): number {
  const maxTop = Math.max(0, container.scrollHeight - container.clientHeight);
  return Math.max(0, Math.min(maxTop, top));
}

function centeredTop(container: HTMLElement, line: HTMLElement): number {
  const containerRect = container.getBoundingClientRect();
  const lineRect = line.getBoundingClientRect();
  const offset = lineRect.top - containerRect.top;
  return clampScrollTop(
    container,
    container.scrollTop + offset - Math.max(0, (container.clientHeight - lineRect.height) / 2),
  );
}

export function useLyricsAutoFollow(activeLineId: string | null, isPlaying: boolean) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const lineRowRefs = useRef(new Map<string, HTMLDivElement>());
  const shouldFollowRef = useRef(true);
  const programmaticScrollUntilRef = useRef(0);
  const wasPlayingRef = useRef(false);

  useEffect(() => {
    if (isPlaying && !wasPlayingRef.current) {
      shouldFollowRef.current = true;
    }
    if (!isPlaying) {
      shouldFollowRef.current = true;
    }
    wasPlayingRef.current = isPlaying;
  }, [isPlaying]);

  const registerLineRow = useCallback((lineId: string, node: HTMLDivElement | null) => {
    if (node) {
      lineRowRefs.current.set(lineId, node);
    } else {
      lineRowRefs.current.delete(lineId);
    }
  }, []);

  const disableAutoFollow = useCallback(() => {
    if (isPlaying) shouldFollowRef.current = false;
  }, [isPlaying]);

  const handleScroll = useCallback(() => {
    if (!isPlaying) return;
    if (performance.now() < programmaticScrollUntilRef.current) return;
    shouldFollowRef.current = false;
  }, [isPlaying]);

  useEffect(() => {
    if (!isPlaying || !activeLineId || !shouldFollowRef.current) return;
    const container = scrollContainerRef.current;
    const line = lineRowRefs.current.get(activeLineId);
    if (!container || !line) return;
    const top = centeredTop(container, line);
    if (Math.abs(container.scrollTop - top) < 2) return;
    const behavior: ScrollBehaviorMode = reducedMotion() ? 'auto' : 'smooth';
    programmaticScrollUntilRef.current = performance.now() + 900;
    if (typeof container.scrollTo === 'function') {
      container.scrollTo({top, behavior});
    } else {
      container.scrollTop = top;
    }
  }, [activeLineId, isPlaying]);

  return {
    disableAutoFollow,
    handleScroll,
    registerLineRow,
    scrollContainerRef,
  };
}
