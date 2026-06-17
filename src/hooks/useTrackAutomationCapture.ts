import {useCallback} from 'react';

import type {AutomationTargetType} from '../automation/trackAutomation';
import {captureNativeTrackAutomationPoint} from '../native/trackAutomationCapture';
import {useDAWStore} from '../store/useDAWStore';

export type TrackAutomationCaptureHandler = (
  trackId: string,
  targetType: AutomationTargetType,
  parameterId: string,
  beat: number,
) => void;

export function useTrackAutomationCapture(): TrackAutomationCaptureHandler {
  const upsertTrackAutomationLane = useDAWStore(state => state.upsertTrackAutomationLane);

  return useCallback((trackId, targetType, parameterId, beat) => {
    const capture = captureNativeTrackAutomationPoint({trackId, targetType, parameterId, beat});
    if (!capture) {
      return;
    }

    // Native owns the current parameter value; the renderer only mirrors the returned JSON lane.
    upsertTrackAutomationLane(capture.trackId, {
      targetType: capture.lane.targetType,
      parameterId: capture.lane.parameterId,
      points: capture.lane.points,
    });
  }, [upsertTrackAutomationLane]);
}
