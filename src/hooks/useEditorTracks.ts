import {useMemo} from 'react';

import {isBottomPanelTrack, useDAWStore, type DAWTrack} from '../store/useDAWStore';

export function useEditorTracks(): {armedTrack: DAWTrack | null; activeTrack: DAWTrack | null} {
  const tracks = useDAWStore(state => state.tracks);
  const selectedTrackId = useDAWStore(state => state.selectedTrackId);

  const armedTrack = useMemo(
    () => tracks.find(track => track.isRecordArmed) ?? null,
    [tracks],
  );

  const activeTrack = useMemo(() => {
    if (selectedTrackId) {
      return tracks.find(track => track.id === selectedTrackId) ?? null;
    }
    return (
      tracks.find(track => isBottomPanelTrack(track)) ??
      armedTrack ??
      tracks.find(track => track.type === 'software_instrument') ??
      null
    );
  }, [armedTrack, selectedTrackId, tracks]);

  return {armedTrack, activeTrack};
}
