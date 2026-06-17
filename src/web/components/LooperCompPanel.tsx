import React, {useMemo} from 'react';

import {looperCompLayers} from '../../transport/looperOverdub';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';

type LooperCompPanelProps = {
  blocks: DAWBlock[];
  tracks: DAWTrack[];
  onCompLayer: (layerId: string) => void;
  onSelectBlock: (blockId: string) => void;
};

function trackName(tracks: DAWTrack[], trackId: string): string {
  return tracks.find(track => track.id === trackId)?.name ?? 'Track';
}

export function LooperCompPanel({
  blocks,
  tracks,
  onCompLayer,
  onSelectBlock,
}: LooperCompPanelProps) {
  const layers = useMemo(() => looperCompLayers(blocks), [blocks]);

  if (layers.length === 0) {
    return null;
  }

  return (
    <section className="inspector-card looper-comp-panel" aria-label="Looper comping">
      <div className="inspector-title">
        <span>Looper Takes</span>
        <strong>{layers.length}</strong>
      </div>
      <div className="looper-comp-list">
        {layers.map(layer => {
          const firstBlock = blocks.find(block => block.looperLayerId === layer.layerId);
          return (
            <div key={layer.layerId} className="looper-comp-row">
              <div>
                <span>{layer.name}</span>
                <small>
                  {trackName(tracks, layer.trackId)} · {layer.segmentCount} segment{layer.segmentCount === 1 ? '' : 's'}
                </small>
              </div>
              <button
                type="button"
                className={layer.isActive ? 'active' : ''}
                aria-pressed={layer.isActive}
                onClick={() => onCompLayer(layer.layerId)}>
                Comp
              </button>
              <button
                type="button"
                disabled={!firstBlock}
                onClick={() => firstBlock && onSelectBlock(firstBlock.id)}
                aria-label={`Select ${layer.name}`}>
                Select
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
