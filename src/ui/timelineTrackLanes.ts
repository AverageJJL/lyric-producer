import {normalizeTrackHeightScale} from '../music/trackOrganization';
import type {DAWTrack} from '../store/useDAWStore';
import {ROW_HEIGHT, RULER_HEIGHT, TRACK_SIDEBAR_FOOTER_HEIGHT} from './timelineLayout';

export type TimelineTrackLane = {
  trackId: string;
  index: number;
  offsetTop: number;
  height: number;
};

export type TimelineTrackLaneLayout = {
  lanes: TimelineTrackLane[];
  rowAreaHeight: number;
  contentHeight: number;
  maxTrackRows: number;
};

export type TimelineTrackHitRow = {
  key: string;
  index: number;
  offsetTop: number;
  height: number;
};

export function timelineTrackHeight(
  track: Pick<DAWTrack, 'trackHeightScale'>,
  baseRowHeight = ROW_HEIGHT,
): number {
  return Math.round(baseRowHeight * normalizeTrackHeightScale(track.trackHeightScale));
}

export function buildTimelineTrackLaneLayout(
  tracks: Array<Pick<DAWTrack, 'id' | 'trackHeightScale'>>,
  baseRowHeight = ROW_HEIGHT,
  rulerHeight = RULER_HEIGHT,
): TimelineTrackLaneLayout {
  let offsetTop = 0;
  const lanes = tracks.map((track, index) => {
    const height = timelineTrackHeight(track, baseRowHeight);
    const lane = {trackId: track.id, index, offsetTop, height};
    offsetTop += height;
    return lane;
  });
  const rowAreaHeight = lanes.length > 0 ? offsetTop : baseRowHeight;
  return {
    lanes,
    rowAreaHeight,
    contentHeight: rulerHeight + rowAreaHeight + TRACK_SIDEBAR_FOOTER_HEIGHT,
    maxTrackRows: Math.max(tracks.length, 1),
  };
}

export function timelineTrackHitRows(layout: TimelineTrackLaneLayout): TimelineTrackHitRow[] {
  if (layout.lanes.length > 0) {
    return layout.lanes.map(lane => ({...lane, key: lane.trackId}));
  }
  return [{key: 'empty-track-row', index: 0, offsetTop: 0, height: layout.rowAreaHeight}];
}

export function trackIndexAtY(layout: TimelineTrackLaneLayout, y: number): number {
  if (layout.lanes.length === 0) {
    return 0;
  }
  const clampedY = Math.max(0, Math.min(y, Math.max(0, layout.rowAreaHeight - 1)));
  return layout.lanes.find(lane =>
    clampedY >= lane.offsetTop && clampedY < lane.offsetTop + lane.height,
  )?.index ?? layout.lanes[layout.lanes.length - 1]!.index;
}

export function trackIndexForDragDelta(
  layout: TimelineTrackLaneLayout,
  startTrackId: string,
  dy: number,
): number {
  const lane = layout.lanes.find(item => item.trackId === startTrackId);
  if (!lane) {
    return 0;
  }
  return trackIndexAtY(layout, lane.offsetTop + lane.height / 2 + dy);
}
