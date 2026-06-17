import React from 'react';

import {
  normalizeTrackHeightScale,
  trackHeightScaleLabel,
  TRACK_HEIGHT_SCALE_OPTIONS,
} from '../../music/trackOrganization';
import type {DAWTrack} from '../../store/useDAWStore';
import {useDAWStore} from '../../store/useDAWStore';

type TrackHeightControlProps = {
  track: Pick<DAWTrack, 'id' | 'name' | 'trackHeightScale'>;
};

export function TrackHeightControl({track}: TrackHeightControlProps) {
  const setTrackHeightScale = useDAWStore(state => state.setTrackHeightScale);
  const scale = normalizeTrackHeightScale(track.trackHeightScale);

  return (
    <label className="track-height-control" onClick={event => event.stopPropagation()}>
      <span>H</span>
      <select
        aria-label={`Track height for ${track.name}`}
        data-copilot-id={`track:${track.id}:height`}
        data-copilot-purpose="Change the visual height of this track lane."
        value={scale}
        onChange={event => setTrackHeightScale(track.id, Number(event.currentTarget.value))}>
        {TRACK_HEIGHT_SCALE_OPTIONS.map(option => (
          <option key={option} value={option}>
            {trackHeightScaleLabel(option)}
          </option>
        ))}
      </select>
    </label>
  );
}
