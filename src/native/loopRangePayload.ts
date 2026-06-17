import {
  LINEAR_PLAYBACK_LENGTH_BEATS,
  normalizeCycleRange,
} from '../transport/cycleRange';
import {
  looperLengthBeats,
  normalizeLooperLengthBars,
  normalizePerformanceMode,
  type LooperLengthBars,
  type ProjectPerformanceMode,
} from '../transport/performanceMode';
import type {TimeSignature} from '../store/projectMetadata';

type LoopRangeState = {
  performanceMode?: ProjectPerformanceMode;
  looperLengthBars?: LooperLengthBars;
  timeSignature?: TimeSignature;
  isCycleEnabled?: boolean;
  cycleStartBeat?: number;
  cycleEndBeat?: number;
};

export function buildNativeLoopRangePayload(state: LoopRangeState) {
  if (normalizePerformanceMode(state.performanceMode) === 'looper') {
    return {
      startBeat: 0,
      lengthBeats: looperLengthBeats(
        normalizeLooperLengthBars(state.looperLengthBars),
        state.timeSignature,
      ),
      looping: true,
    };
  }

  if (!state.isCycleEnabled) {
    return {startBeat: 0, lengthBeats: LINEAR_PLAYBACK_LENGTH_BEATS, looping: false};
  }

  const range = normalizeCycleRange(
    state.cycleStartBeat ?? 0,
    state.cycleEndBeat ?? LINEAR_PLAYBACK_LENGTH_BEATS,
  );
  return {
    startBeat: range.startBeat,
    lengthBeats: range.endBeat - range.startBeat,
    looping: true,
  };
}
