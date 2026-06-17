export const AUTOMATION_MODES = ['read', 'write', 'touch', 'latch'] as const;

export type AutomationMode = (typeof AUTOMATION_MODES)[number];
export type AutomationTargetType = 'track' | 'fx' | 'instrument';

export type AutomationPoint = {
  beat: number;
  value: number;
};

export type TrackAutomationLane = {
  targetType: AutomationTargetType;
  parameterId: string;
  points: AutomationPoint[];
};

export type AutomationLaneTarget = {
  targetType: AutomationTargetType;
  parameterId: string;
};

export const DEFAULT_AUTOMATION_MODE: AutomationMode = 'read';

function finiteNumber(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function normalizedTarget(target: AutomationLaneTarget): AutomationLaneTarget {
  return {
    targetType: target.targetType,
    parameterId: target.parameterId.trim(),
  };
}

function laneMatchesTarget(lane: TrackAutomationLane, target: AutomationLaneTarget): boolean {
  return lane.targetType === target.targetType && lane.parameterId === target.parameterId;
}

function automationLaneSort(left: TrackAutomationLane, right: TrackAutomationLane): number {
  return (
    left.targetType.localeCompare(right.targetType) ||
    left.parameterId.localeCompare(right.parameterId)
  );
}

function automationPointMatchesBeat(point: AutomationPoint, beat: number): boolean {
  return Math.abs(point.beat - beat) < 0.000001;
}

export function normalizeAutomationMode(value: unknown): AutomationMode {
  return AUTOMATION_MODES.includes(value as AutomationMode)
    ? value as AutomationMode
    : DEFAULT_AUTOMATION_MODE;
}

export function defaultTrackAutomationLanes(): TrackAutomationLane[] {
  return [
    {targetType: 'track', parameterId: 'volumeDb', points: []},
    {targetType: 'track', parameterId: 'pan', points: []},
  ];
}

export function normalizeAutomationLane(lane: TrackAutomationLane): TrackAutomationLane {
  return {
    targetType: lane.targetType,
    parameterId: lane.parameterId.trim(),
    points: lane.points
      .map(point => ({
        beat: Math.max(0, finiteNumber(point.beat, 0)),
        value: finiteNumber(point.value, 0),
      }))
      .sort((left, right) => left.beat - right.beat),
  };
}

export function findAutomationPointAtBeat(
  lanes: TrackAutomationLane[] | undefined,
  target: AutomationLaneTarget,
  beat: number,
): AutomationPoint | null {
  const normalized = normalizedTarget(target);
  const safeBeat = Math.max(0, finiteNumber(beat, 0));
  const lane = lanes?.find(item => laneMatchesTarget(normalizeAutomationLane(item), normalized));
  return lane?.points.find(point => automationPointMatchesBeat(point, safeBeat)) ?? null;
}

export function upsertAutomationLane(
  lanes: TrackAutomationLane[] | undefined,
  lane: TrackAutomationLane,
): TrackAutomationLane[] {
  const normalized = normalizeAutomationLane(lane);
  const base = lanes && lanes.length > 0 ? lanes : defaultTrackAutomationLanes();
  const next = base.filter(item =>
    item.targetType !== normalized.targetType || item.parameterId !== normalized.parameterId,
  );
  return [...next, normalized].sort(automationLaneSort);
}

export function upsertAutomationPoint(
  lanes: TrackAutomationLane[] | undefined,
  target: AutomationLaneTarget,
  point: AutomationPoint,
): TrackAutomationLane[] {
  const normalized = normalizedTarget(target);
  const safePoint = {
    beat: Math.max(0, finiteNumber(point.beat, 0)),
    value: finiteNumber(point.value, 0),
  };
  const base = lanes && lanes.length > 0 ? lanes : defaultTrackAutomationLanes();
  const existingLane = base.find(lane => laneMatchesTarget(normalizeAutomationLane(lane), normalized));
  const nextLane = normalizeAutomationLane({
    targetType: normalized.targetType,
    parameterId: normalized.parameterId,
    points: [
      ...(existingLane?.points ?? []).filter(
        item => !automationPointMatchesBeat(item, safePoint.beat),
      ),
      safePoint,
    ],
  });
  return upsertAutomationLane(base, nextLane);
}

export function removeAutomationPoint(
  lanes: TrackAutomationLane[] | undefined,
  target: AutomationLaneTarget,
  beat: number,
): TrackAutomationLane[] {
  const normalized = normalizedTarget(target);
  const safeBeat = Math.max(0, finiteNumber(beat, 0));
  return (lanes ?? [])
    .map(lane => {
      const current = normalizeAutomationLane(lane);
      if (!laneMatchesTarget(current, normalized)) {
        return current;
      }
      return {
        ...current,
        points: current.points.filter(point => !automationPointMatchesBeat(point, safeBeat)),
      };
    })
    .sort(automationLaneSort);
}
