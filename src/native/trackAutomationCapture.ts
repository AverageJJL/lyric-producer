import type {AutomationTargetType} from '../automation/trackAutomation';
import {sendNativeAudioCommand} from './NativeAudioEngine';

export type NativeCapturedAutomationLane = {
  targetType: AutomationTargetType;
  parameterId: string;
  pointCount: number;
  points: Array<{beat: number; value: number}>;
};

export type NativeCapturedAutomationPoint = {
  trackId: string;
  targetType: AutomationTargetType;
  parameterId: string;
  beat: number;
  value: number;
  automationMode: string;
  lane: NativeCapturedAutomationLane;
};

export type NativeAutomationCaptureRequest = {
  trackId: string;
  targetType: AutomationTargetType;
  parameterId: string;
  beat?: number;
};

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isTargetType(value: unknown): value is AutomationTargetType {
  return value === 'track' || value === 'fx' || value === 'instrument';
}

function isCapturedLane(value: unknown): value is NativeCapturedAutomationLane {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const lane = value as Partial<NativeCapturedAutomationLane>;
  return (
    isTargetType(lane.targetType) &&
    typeof lane.parameterId === 'string' &&
    isNumber(lane.pointCount) &&
    Array.isArray(lane.points) &&
    lane.points.every(point =>
      Boolean(point) &&
      typeof point === 'object' &&
      isNumber((point as {beat?: unknown}).beat) &&
      isNumber((point as {value?: unknown}).value),
    )
  );
}

function isCapturedPoint(value: unknown): value is NativeCapturedAutomationPoint {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const capture = value as Partial<NativeCapturedAutomationPoint>;
  return (
    typeof capture.trackId === 'string' &&
    isTargetType(capture.targetType) &&
    typeof capture.parameterId === 'string' &&
    isNumber(capture.beat) &&
    isNumber(capture.value) &&
    typeof capture.automationMode === 'string' &&
    isCapturedLane(capture.lane)
  );
}

export function captureNativeTrackAutomationPoint(
  request: NativeAutomationCaptureRequest,
): NativeCapturedAutomationPoint | null {
  const response = sendNativeAudioCommand('capture_track_automation', request);
  if (!response) {
    return null;
  }

  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: unknown};
    if (parsed.ok && isCapturedPoint(parsed.data)) {
      return parsed.data;
    }
  } catch {
    return null;
  }

  return null;
}
