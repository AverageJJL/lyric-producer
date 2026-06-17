import React, {useMemo} from 'react';

import type {AutomationTargetType} from '../../automation/trackAutomation';
import type {DAWTrack} from '../../store/useDAWStore';
import {
  BLOCK_VERTICAL_PADDING,
  RULER_HEIGHT,
} from '../../ui/timelineLayout';
import type {TimelineTrackLaneLayout} from '../../ui/timelineTrackLanes';
import {
  automationValueFromLaneRatio,
  buildTimelineAutomationLanes,
} from '../../ui/timelineAutomationLanes';

type TimelineAutomationLanesProps = {
  tracks: DAWTrack[];
  visibleTimelineBeats: number;
  pixelsPerBeat: number;
  trackLaneLayout: TimelineTrackLaneLayout;
  onPointSet?: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
    value: number,
  ) => void;
  onPointRemove?: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
  ) => void;
};

const LANE_HEIGHT = 13;
const LANE_GAP = 3;

function pointLabel(trackName: string, laneLabel: string, beat: number, value: number): string {
  return `${laneLabel} automation point for ${trackName} at beat ${Math.floor(beat) + 1}, value ${value}`;
}

export function TimelineAutomationLanes({
  tracks,
  visibleTimelineBeats,
  pixelsPerBeat,
  trackLaneLayout,
  onPointSet,
  onPointRemove,
}: TimelineAutomationLanesProps) {
  const lanes = useMemo(
    () => buildTimelineAutomationLanes({tracks, visibleTimelineBeats}),
    [tracks, visibleTimelineBeats],
  );

  if (lanes.length === 0) {
    return null;
  }

  const writePoint = (
    event: React.MouseEvent<HTMLDivElement>,
    lane: typeof lanes[number],
  ) => {
    if (!onPointSet) {
      return;
    }
    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    const beat = Math.round(
      Math.max(0, Math.min(visibleTimelineBeats, (event.clientX - rect.left) / pixelsPerBeat))
      * 1000,
    ) / 1000;
    const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0.5;
    onPointSet(
      lane.trackId,
      lane.targetType,
      lane.parameterId,
      beat,
      automationValueFromLaneRatio(lane, ratio),
    );
  };

  const removePoint = (
    event: React.MouseEvent<HTMLButtonElement>,
    lane: typeof lanes[number],
    beat: number,
  ) => {
    event.stopPropagation();
    onPointRemove?.(lane.trackId, lane.targetType, lane.parameterId, beat);
  };

  return (
    <div className="timeline-automation-layer" aria-label="Timeline automation lanes">
      {lanes.map(lane => {
        const trackLane = trackLaneLayout.lanes.find(item => item.trackId === lane.trackId);
        if (!trackLane) {
          return null;
        }
        const top =
          RULER_HEIGHT + trackLane.offsetTop + trackLane.height
          - BLOCK_VERTICAL_PADDING - (lane.laneIndex + 1) * (LANE_HEIGHT + LANE_GAP);
        return (
          <div
            key={`${lane.trackId}-${lane.laneKey}`}
            className="timeline-automation-lane"
            aria-label={`Automation lane ${lane.label} for ${lane.trackName}`}
            onClick={event => writePoint(event, lane)}
            style={{top, height: LANE_HEIGHT}}>
            <span className="timeline-automation-label">{lane.label}</span>
            {lane.points.map(point => (
              <button
                type="button"
                key={`${lane.trackId}-${lane.laneKey}-${point.beat}`}
                className="timeline-automation-point"
                aria-label={pointLabel(lane.trackName, lane.label, point.beat, point.value)}
                onClick={event => removePoint(event, lane, point.beat)}
                style={{left: point.beat * pixelsPerBeat}}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
