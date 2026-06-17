import {normalizeAutomationLane, type TrackAutomationLane} from '../automation/trackAutomation';
import {
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
  MIN_TRACK_PAN,
  MIN_TRACK_VOLUME_DB,
} from '../music/trackMix';
import type {DAWTrack} from '../store/useDAWStore';

export type TimelineAutomationPoint = {
  beat: number;
  value: number;
};

export type TimelineAutomationLane = {
  trackId: string;
  trackName: string;
  laneKey: string;
  label: string;
  targetType: TrackAutomationLane['targetType'];
  parameterId: string;
  laneIndex: number;
  points: TimelineAutomationPoint[];
};

type BuildTimelineAutomationLanesInput = {
  tracks: DAWTrack[];
  visibleTimelineBeats: number;
};

function laneKey(lane: TrackAutomationLane): string {
  return `${lane.targetType}:${lane.parameterId}`;
}

function roundAutomationValue(value: number): number {
  return Number(value.toFixed(3));
}

export function automationLaneLabel(lane: Pick<TrackAutomationLane, 'targetType' | 'parameterId'>): string {
  if (lane.targetType === 'track' && lane.parameterId === 'volumeDb') {
    return 'Volume';
  }
  if (lane.targetType === 'track' && lane.parameterId === 'pan') {
    return 'Pan';
  }
  if (lane.targetType === 'fx' && lane.parameterId === 'eq.dryWet') {
    return 'EQ Mix';
  }
  if (lane.targetType === 'instrument' && lane.parameterId === 'filter.cutoff') {
    return 'Cutoff';
  }
  if (lane.targetType === 'instrument' && lane.parameterId === 'filter.resonance') {
    return 'Resonance';
  }
  return lane.parameterId
    .split('.')
    .filter(Boolean)
    .slice(-2)
    .join(' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

export function automationValueFromLaneRatio(
  lane: Pick<TrackAutomationLane, 'targetType' | 'parameterId'>,
  ratio: number,
): number {
  const clampedRatio = Math.max(0, Math.min(1, ratio));
  if (lane.targetType === 'track' && lane.parameterId === 'volumeDb') {
    return roundAutomationValue(
      MAX_TRACK_VOLUME_DB - clampedRatio * (MAX_TRACK_VOLUME_DB - MIN_TRACK_VOLUME_DB),
    );
  }
  if (lane.targetType === 'track' && lane.parameterId === 'pan') {
    return roundAutomationValue(MAX_TRACK_PAN - clampedRatio * (MAX_TRACK_PAN - MIN_TRACK_PAN));
  }
  return roundAutomationValue(1 - clampedRatio);
}

export function buildTimelineAutomationLanes({
  tracks,
  visibleTimelineBeats,
}: BuildTimelineAutomationLanesInput): TimelineAutomationLane[] {
  const visible = Math.max(0, visibleTimelineBeats);
  return tracks.flatMap(track => {
    const visibleLanes = (track.automationLanes ?? [])
      .map(normalizeAutomationLane)
      .map(lane => ({
        lane,
        points: lane.points.filter(point => point.beat >= 0 && point.beat <= visible),
      }))
      .filter(item => item.points.length > 0 || track.automationMode !== 'read');

    return visibleLanes.map((item, laneIndex) => ({
      trackId: track.id,
      trackName: track.name,
      laneKey: laneKey(item.lane),
      label: automationLaneLabel(item.lane),
      targetType: item.lane.targetType,
      parameterId: item.lane.parameterId,
      laneIndex,
      points: item.points,
    }));
  });
}
