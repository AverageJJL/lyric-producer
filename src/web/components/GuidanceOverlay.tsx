import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';

import {findCopilotTargetElement, type CopilotVisibleTarget} from '../../assistant/copilotContext';
import {GUIDE_TARGETS, type GuideTargetId} from '../../assistant/copilotGuide';

type GuidanceOverlayProps = {
  targetId: GuideTargetId | null;
  targets?: CopilotVisibleTarget[];
};

type TargetRect = {
  top: number;
  left: number;
  width: number;
  height: number;
  label: string;
};

function targetElement(targetId: GuideTargetId): HTMLElement | null {
  return findCopilotTargetElement(targetId);
}

function targetLabel(targetId: GuideTargetId, targets: CopilotVisibleTarget[]): string | null {
  return targets.find(target => target.id === targetId)?.label
    ?? GUIDE_TARGETS.find(item => item.id === targetId)?.label
    ?? cleanElementLabel(findCopilotTargetElement(targetId));
}

function cleanElementLabel(element: HTMLElement | null): string | null {
  const text = element?.dataset.copilotLabel
    ?? element?.getAttribute('aria-label')
    ?? element?.getAttribute('title')
    ?? element?.textContent;
  return text?.replace(/\s+/g, ' ').trim() || null;
}

function visibleRect(element: HTMLElement, label: string): TargetRect | null {
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    label,
  };
}

function requestFrame(callback: FrameRequestCallback): number {
  return window.requestAnimationFrame
    ? window.requestAnimationFrame(callback)
    : window.setTimeout(() => callback(performance.now()), 16);
}

function cancelFrame(frame: number): void {
  if (window.cancelAnimationFrame) {
    window.cancelAnimationFrame(frame);
    return;
  }
  window.clearTimeout(frame);
}

export function GuidanceOverlay({targetId, targets = []}: GuidanceOverlayProps) {
  const [rect, setRect] = useState<TargetRect | null>(null);
  const frameRef = useRef<number | null>(null);

  const measure = React.useCallback(() => {
    if (!targetId) {
      setRect(null);
      return;
    }
    const label = targetLabel(targetId, targets);
    const element = targetElement(targetId);
    setRect(element && label ? visibleRect(element, label) : null);
  }, [targetId, targets]);

  useLayoutEffect(() => {
    if (!targetId) {
      setRect(null);
      return;
    }
    const element = targetElement(targetId);
    element?.scrollIntoView?.({block: 'center', inline: 'nearest'});
    frameRef.current = requestFrame(() => {
      frameRef.current = null;
      measure();
    });
    return () => {
      if (frameRef.current !== null) {
        cancelFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [measure, targetId]);

  useEffect(() => {
    if (!targetId) {
      return undefined;
    }
    const scheduleMeasure = () => {
      if (frameRef.current !== null) {
        return;
      }
      frameRef.current = requestFrame(() => {
        frameRef.current = null;
        measure();
      });
    };
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    const element = targetElement(targetId);
    const observer = window.ResizeObserver && element
      ? new window.ResizeObserver(scheduleMeasure)
      : null;
    observer?.observe(element as Element);
    return () => {
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      observer?.disconnect();
    };
  }, [measure, targetId]);

  if (!targetId || !rect) {
    return null;
  }

  return (
    <div
      className="guidance-overlay"
      aria-label={`Guided target: ${rect.label}`}
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}>
      <span className="guidance-ring" />
      <span className="guidance-cursor" />
    </div>
  );
}
