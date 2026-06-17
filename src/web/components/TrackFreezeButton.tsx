import React from 'react';

import {useDAWStore, type DAWTrack} from '../../store/useDAWStore';

type TrackFreezeButtonProps = {
  track: DAWTrack;
};

export function TrackFreezeButton({track}: TrackFreezeButtonProps) {
  const setTrackFrozen = useDAWStore(state => state.setTrackFrozen);
  const frozen = track.isFrozen === true;

  return (
    <button
      type="button"
      className={`mini-button track-org-button ${frozen ? 'active' : ''}`}
      aria-label={`${frozen ? 'Unfreeze' : 'Freeze'} ${track.name}`}
      data-copilot-id={`track:${track.id}:freeze`}
      data-copilot-label={`${frozen ? 'Unfreeze' : 'Freeze'} ${track.name}`}
      data-copilot-purpose="Toggle track freeze without changing the arrangement."
      onClick={event => {
        event.stopPropagation();
        setTrackFrozen(track.id, !frozen);
      }}>
      {frozen ? 'Thaw' : 'Frz'}
    </button>
  );
}
