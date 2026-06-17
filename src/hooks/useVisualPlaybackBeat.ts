import {useEffect, useRef, useState} from 'react';

import type {TempoMapEvent} from '../transport/tempoMap';
import {tempoMapBeatAtSeconds, tempoMapSecondsAtBeat} from '../transport/tempoMapTiming';
import {useDAWStore} from '../store/useDAWStore';

const MIN_VISUAL_DELTA_BEATS = 0.0001;
/** Native transport publishes near 33 ms; 100 ms smooths gaps without hiding a stalled engine. */
const MAX_VISUAL_EXTRAPOLATION_SECONDS = 0.1;

type VisualBeatAnchor = {
  timelineSeconds: number;
  capturedAtSeconds: number;
  bpm: number;
  tempoMap: TempoMapEvent[];
};

function nowSeconds(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function clampBeat(beat: number, maxBeat: number): number {
  if (!Number.isFinite(beat)) {
    return 0;
  }
  return Math.max(0, Math.min(beat, Math.max(0, maxBeat)));
}

function scheduleFrame(callback: FrameRequestCallback): number {
  if (typeof requestAnimationFrame === 'function') {
    return requestAnimationFrame(callback);
  }
  return window.setTimeout(() => callback(nowSeconds() * 1000), 16);
}

function cancelFrame(frame: number): void {
  if (typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(frame);
    return;
  }
  window.clearTimeout(frame);
}

/**
 * Smooths only the painted playhead between native transport updates.
 * The extrapolated beat is never written back to Zustand or sent to C++ so audio,
 * recording, automation, and project snapshots stay anchored to engine state.
 */
export function useVisualPlaybackBeat(maxBeat: number): number {
  const storeBeat = useDAWStore(state => state.playheadBeat);
  const isPlaybackMoving = useDAWStore(
    state => state.isPlaying && !state.playheadOwnedByUser && !state.playAwaitingEngine,
  );
  const [visualBeat, setVisualBeat] = useState(() => clampBeat(storeBeat, maxBeat));
  const anchorRef = useRef<VisualBeatAnchor | null>(null);
  const maxBeatRef = useRef(maxBeat);
  const visualBeatRef = useRef(visualBeat);

  const commitVisualBeat = (beat: number) => {
    const nextBeat = clampBeat(beat, maxBeatRef.current);
    if (Math.abs(nextBeat - visualBeatRef.current) < MIN_VISUAL_DELTA_BEATS) {
      return;
    }

    visualBeatRef.current = nextBeat;
    setVisualBeat(nextBeat);
  };

  useEffect(() => {
    maxBeatRef.current = maxBeat;
    if (!isPlaybackMoving || !anchorRef.current) {
      commitVisualBeat(storeBeat);
    }
  });

  useEffect(() => {
    return useDAWStore.subscribe((state, previous) => {
      if (!state.isPlaying || state.playheadOwnedByUser || state.playAwaitingEngine) {
        anchorRef.current = null;
        return;
      }

      const isEngineTick =
        state.syncSource === 'engine' &&
        (
          previous.syncSource !== 'engine' ||
          state.playheadBeat !== previous.playheadBeat ||
          state.playheadSeconds !== previous.playheadSeconds ||
          state.isPlaying !== previous.isPlaying
        );

      if (!isEngineTick) {
        return;
      }

      anchorRef.current = {
        timelineSeconds: tempoMapSecondsAtBeat(state.playheadBeat, state.bpm, state.tempoMap),
        capturedAtSeconds: nowSeconds(),
        bpm: state.bpm,
        tempoMap: state.tempoMap,
      };
    });
  }, []);

  useEffect(() => {
    if (!isPlaybackMoving) {
      anchorRef.current = null;
      commitVisualBeat(useDAWStore.getState().playheadBeat);
      return undefined;
    }

    let frame = 0;
    let active = true;
    const tick = () => {
      if (!active) {
        return;
      }

      const state = useDAWStore.getState();
      const anchor = anchorRef.current;
      if (!state.isPlaying || state.playheadOwnedByUser || state.playAwaitingEngine || !anchor) {
        commitVisualBeat(state.playheadBeat);
      } else {
        const elapsedSeconds = Math.min(
          Math.max(0, nowSeconds() - anchor.capturedAtSeconds),
          MAX_VISUAL_EXTRAPOLATION_SECONDS,
        );
        commitVisualBeat(
          tempoMapBeatAtSeconds(
            anchor.timelineSeconds + elapsedSeconds,
            anchor.bpm,
            anchor.tempoMap,
          ),
        );
      }

      frame = scheduleFrame(tick);
    };

    frame = scheduleFrame(tick);
    return () => {
      active = false;
      cancelFrame(frame);
    };
  }, [isPlaybackMoving]);

  return visualBeat;
}
