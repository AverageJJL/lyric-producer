import React from 'react';

import {useDAWStore, type DAWTrack} from '../../store/useDAWStore';

type TrackOrganizationLabelsProps = {
  track: DAWTrack;
};

type LabelKey = 'folder' | 'group';

function stopRowSelection(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

export function TrackOrganizationLabels({track}: TrackOrganizationLabelsProps) {
  const setTrackFolderName = useDAWStore(state => state.setTrackFolderName);
  const setTrackGroupName = useDAWStore(state => state.setTrackGroupName);
  const [folderName, setFolderName] = React.useState(track.trackFolderName ?? '');
  const [groupName, setGroupName] = React.useState(track.trackGroupName ?? '');

  React.useEffect(() => {
    setFolderName(track.trackFolderName ?? '');
    setGroupName(track.trackGroupName ?? '');
  }, [track.trackFolderName, track.trackGroupName]);

  const commit = (key: LabelKey) => {
    if (key === 'folder') {
      setTrackFolderName(track.id, folderName);
    } else {
      setTrackGroupName(track.id, groupName);
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>, key: LabelKey) => {
    if (event.key === 'Enter') {
      event.currentTarget.blur();
      commit(key);
    }
  };

  return (
    <span className="track-organization-labels" onClick={stopRowSelection} onPointerDown={stopRowSelection}>
      <input
        aria-label={`Folder for ${track.name}`}
        data-copilot-id={`track:${track.id}:folder`}
        data-copilot-purpose="Assign this track to a visual folder label."
        placeholder="Fld"
        value={folderName}
        onBlur={() => commit('folder')}
        onChange={event => setFolderName(event.currentTarget.value)}
        onKeyDown={event => onKeyDown(event, 'folder')}
      />
      <input
        aria-label={`Group for ${track.name}`}
        data-copilot-id={`track:${track.id}:group`}
        data-copilot-purpose="Assign this track to a visual group label."
        placeholder="Grp"
        value={groupName}
        onBlur={() => commit('group')}
        onChange={event => setGroupName(event.currentTarget.value)}
        onKeyDown={event => onKeyDown(event, 'group')}
      />
    </span>
  );
}
