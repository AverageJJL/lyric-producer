import React, {useMemo} from 'react';

import {recordingTakeGroups} from '../../transport/recordingTakes';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';

type RecordingTakesPanelProps = {
  blocks: DAWBlock[];
  tracks: DAWTrack[];
  onCompTake: (takeId: string) => void;
  onSelectBlock: (blockId: string) => void;
};

function trackName(tracks: DAWTrack[], trackId: string): string {
  return tracks.find(track => track.id === trackId)?.name ?? 'Track';
}

export function RecordingTakesPanel({
  blocks,
  tracks,
  onCompTake,
  onSelectBlock,
}: RecordingTakesPanelProps) {
  const groups = useMemo(() => recordingTakeGroups(blocks), [blocks]);

  if (groups.length === 0) {
    return null;
  }

  return (
    <section
      className="inspector-card looper-comp-panel recording-takes-panel"
      aria-label="Recording takes">
      <div className="inspector-title">
        <span>Recording Takes</span>
        <strong>{groups.reduce((count, group) => count + group.takes.length, 0)}</strong>
      </div>
      <div className="looper-comp-list">
        {groups.flatMap(group =>
          group.takes.map(take => (
            <div key={take.takeId} className="looper-comp-row">
              <div>
                <span>{take.name}</span>
                <small>
                  {trackName(tracks, group.trackId)} · {take.lengthBeats.toFixed(1)} beats
                </small>
              </div>
              <button
                type="button"
                className={take.isActive ? 'active' : ''}
                aria-pressed={take.isActive}
                onClick={() => onCompTake(take.takeId)}>
                Comp
              </button>
              <button
                type="button"
                onClick={() => onSelectBlock(take.blockId)}
                aria-label={`Select ${take.name}`}>
                Select
              </button>
            </div>
          )),
        )}
      </div>
    </section>
  );
}
