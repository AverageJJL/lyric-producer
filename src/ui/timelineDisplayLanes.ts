import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import {RULER_HEIGHT, ROW_HEIGHT, TRACK_SIDEBAR_FOOTER_HEIGHT} from './timelineLayout';
import {timelineTrackHeight, type TimelineTrackLaneLayout} from './timelineTrackLanes';

export type TimelineDisplayLane =
  | {
      kind: 'track';
      key: string;
      trackId: string;
      index: number;
      offsetTop: number;
      height: number;
    }
  | {
      kind: 'take';
      key: string;
      trackId: string;
      groupId: string;
      sourceBlockId: string;
      takeIndex: number;
      index: number;
      offsetTop: number;
      height: number;
    };

export type TimelineDisplayLaneLayout = {
  lanes: TimelineDisplayLane[];
  rowAreaHeight: number;
  contentHeight: number;
  maxTrackRows: number;
  realTrackLaneLayout: TimelineTrackLaneLayout;
};

function expandedCompGroupsForTrack(
  blocks: DAWBlock[],
  trackId: string,
  expandedGroupIds: Set<string>,
): string[] {
  const groups = new Map<string, number>();
  blocks.forEach(block => {
    if (!block.recordingCompGroupId || block.trackId !== trackId) {
      return;
    }
    const currentStart = groups.get(block.recordingCompGroupId);
    groups.set(
      block.recordingCompGroupId,
      currentStart === undefined ? block.startBeat : Math.min(currentStart, block.startBeat),
    );
  });
  return [...groups.entries()]
    .filter(([groupId]) => expandedGroupIds.has(groupId))
    .sort((left, right) => left[1] - right[1])
    .map(([groupId]) => groupId);
}

function takeBlocksForGroup(blocks: DAWBlock[], groupId: string): DAWBlock[] {
  return blocks
    .filter(block => block.recordingTakeGroupId === groupId && !block.recordingCompGroupId)
    .sort((left, right) => (left.recordingTakeIndex ?? 0) - (right.recordingTakeIndex ?? 0));
}

export function buildTimelineDisplayLaneLayout(
  tracks: Array<Pick<DAWTrack, 'id' | 'trackHeightScale'>>,
  blocks: DAWBlock[],
  expandedTakeGroups: string[],
  baseRowHeight = ROW_HEIGHT,
): TimelineDisplayLaneLayout {
  const expandedGroupIds = new Set(expandedTakeGroups);
  const lanes: TimelineDisplayLane[] = [];
  let offsetTop = 0;

  tracks.forEach((track, trackIndex) => {
    const trackHeight = timelineTrackHeight(track, baseRowHeight);
    lanes.push({
      kind: 'track',
      key: track.id,
      trackId: track.id,
      index: trackIndex,
      offsetTop,
      height: trackHeight,
    });
    offsetTop += trackHeight;

    expandedCompGroupsForTrack(blocks, track.id, expandedGroupIds).forEach(groupId => {
      takeBlocksForGroup(blocks, groupId).forEach((block, takeIndex) => {
        lanes.push({
          kind: 'take',
          key: `${groupId}:${block.id}`,
          trackId: track.id,
          groupId,
          sourceBlockId: block.id,
          takeIndex,
          index: trackIndex,
          offsetTop,
          height: trackHeight,
        });
        offsetTop += trackHeight;
      });
    });
  });

  const rowAreaHeight = lanes.length > 0 ? offsetTop : baseRowHeight;
  const realTrackLanes = lanes
    .filter((lane): lane is Extract<TimelineDisplayLane, {kind: 'track'}> => lane.kind === 'track')
    .map(lane => ({
      trackId: lane.trackId,
      index: lane.index,
      offsetTop: lane.offsetTop,
      height: lane.height,
    }));

  return {
    lanes,
    rowAreaHeight,
    contentHeight: RULER_HEIGHT + rowAreaHeight + TRACK_SIDEBAR_FOOTER_HEIGHT,
    maxTrackRows: Math.max(lanes.length, 1),
    realTrackLaneLayout: {
      lanes: realTrackLanes,
      rowAreaHeight,
      contentHeight: RULER_HEIGHT + rowAreaHeight + TRACK_SIDEBAR_FOOTER_HEIGHT,
      maxTrackRows: Math.max(tracks.length, 1),
    },
  };
}

export function takeSidebarRowsForTrack(
  blocks: DAWBlock[],
  trackId: string,
  expandedTakeGroups: string[],
): Array<{key: string; groupId: string; takeIndex: number}> {
  const expandedGroupIds = new Set(expandedTakeGroups);
  return expandedCompGroupsForTrack(blocks, trackId, expandedGroupIds).flatMap(groupId =>
    takeBlocksForGroup(blocks, groupId).map((block, takeIndex) => ({
      key: `${groupId}:${block.id}`,
      groupId,
      takeIndex,
    })),
  );
}
