import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import type {DrumPattern} from '../music/drumPatterns';
import {patternStepsPayload} from '../music/drumPatterns';
import {
  createNativeAudioEngineEventEmitter,
  DRUM_PATTERN_STEP_EVENT,
} from '../native/NativeAudioEngineEvents';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';

type UseDrumPatternTransportArgs = {
  trackId: string;
  bpm: number;
  pattern: DrumPattern | null;
  isTransportPlaying?: boolean;
};

/** Local 16-step loop playback isolated from the main timeline transport. */
export function useDrumPatternTransport({
  trackId,
  bpm,
  pattern,
  isTransportPlaying = false,
}: UseDrumPatternTransportArgs) {
  const [isLocalPlaying, setIsLocalPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState<number | null>(null);
  const playingRef = useRef(false);
  const patternLanesKey = useMemo(
    () => (pattern ? JSON.stringify(patternStepsPayload(pattern)) : ''),
    [pattern],
  );

  useEffect(() => {
    const emitter = createNativeAudioEngineEventEmitter();
    if (!emitter) {
      return undefined;
    }

    const subscription = emitter.addListener(DRUM_PATTERN_STEP_EVENT, (payload: unknown) => {
      try {
        const parsed = typeof payload === 'string' ? JSON.parse(payload) : payload;
        if (typeof parsed?.step === 'number') {
          setCurrentStep(parsed.step);
        }
      } catch {
        // ignore malformed events
      }
    });

    return () => {
      subscription.remove();
    };
  }, [trackId]);

  useEffect(() => {
    if (!isTransportPlaying || !playingRef.current) {
      return;
    }

    // The main transport owns Tracktion playback once it starts. The bridge already
    // sent stop_pattern_preview, so this hook only mirrors that native handoff.
    playingRef.current = false;
    setIsLocalPlaying(false);
    setCurrentStep(null);
  }, [isTransportPlaying]);

  useEffect(() => {
    if (!playingRef.current || patternLanesKey.length === 0) {
      return;
    }

    const lanes = JSON.parse(patternLanesKey) as Record<string, number[]>;

    sendNativeAudioCommand('update_pattern_preview', {
      bpm,
      lanes,
    });
  }, [bpm, patternLanesKey, trackId]);

  const startLocalPlayback = useCallback(() => {
    if (!pattern) {
      return;
    }

    sendNativeAudioCommand('start_pattern_preview', {
      trackId,
      bpm,
      lanes: patternStepsPayload(pattern),
    });
    playingRef.current = true;
    setIsLocalPlaying(true);
    setCurrentStep(0);
  }, [bpm, pattern, trackId]);

  const stopLocalPlayback = useCallback(() => {
    sendNativeAudioCommand('stop_pattern_preview', {});
    playingRef.current = false;
    setIsLocalPlaying(false);
    setCurrentStep(null);
  }, [trackId]);

  const toggleLocalPlayback = useCallback(() => {
    if (isLocalPlaying) {
      stopLocalPlayback();
    } else {
      startLocalPlayback();
    }
  }, [isLocalPlaying, startLocalPlayback, stopLocalPlayback]);

  useEffect(() => {
    return () => {
      if (playingRef.current) {
        sendNativeAudioCommand('stop_pattern_preview', {});
        playingRef.current = false;
      }
    };
  }, []);

  return {
    isLocalPlaying,
    currentStep,
    startLocalPlayback,
    stopLocalPlayback,
    toggleLocalPlayback,
  };
}
