import {useMemo} from 'react';

import {
  buildCopilotEditableArrangementSummary,
  type CopilotEditableArrangementSummary,
} from '../../assistant/copilotArrangementContext';
import {activeTracks, blocksForActiveTracks} from '../../music/trackOrganization';
import {useDAWStore} from '../../store/useDAWStore';

export function useCopilotEditableArrangement(): CopilotEditableArrangementSummary {
  const tracks = useDAWStore(state => state.tracks);
  const blocks = useDAWStore(state => state.blocks);
  const patterns = useDAWStore(state => state.patterns);
  const selectedTrackId = useDAWStore(state => state.selectedTrackId);
  const selectedBlockId = useDAWStore(state => state.selectedBlockId);
  const selectedBlockIds = useDAWStore(state => state.selectedBlockIds);
  const playheadBeat = useDAWStore(state => state.playheadBeat);

  return useMemo(() => {
    const visibleTracks = activeTracks(tracks);
    return buildCopilotEditableArrangementSummary({
      tracks: visibleTracks,
      blocks: blocksForActiveTracks(blocks, tracks),
      patterns,
      selectedTrackId,
      selectedBlockId,
      selectedBlockIds,
      playheadBeat,
    });
  }, [blocks, patterns, playheadBeat, selectedBlockId, selectedBlockIds, selectedTrackId, tracks]);
}
