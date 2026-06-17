import React from 'react';

import {LOOPER_LENGTH_OPTIONS, type LooperLengthBars} from '../../transport/performanceMode';
import {looperLayerCount} from '../../transport/looperOverdub';
import {useDAWStore} from '../../store/useDAWStore';

export function TransportLooperControl() {
  const performanceMode = useDAWStore(state => state.performanceMode);
  const looperLengthBars = useDAWStore(state => state.looperLengthBars);
  const layerCount = useDAWStore(state => looperLayerCount(state.blocks));
  const setPerformanceMode = useDAWStore(state => state.setPerformanceMode);
  const setLooperLengthBars = useDAWStore(state => state.setLooperLengthBars);
  const isLooper = performanceMode === 'looper';

  return (
    <div className="looper-control" aria-label="Looper mode">
      <button
        type="button"
        className={`looper-toggle ${isLooper ? 'active' : ''}`}
        aria-pressed={isLooper}
        onClick={() => setPerformanceMode(isLooper ? 'linear' : 'looper')}>
        Looper
      </button>
      <select
        aria-label="Looper length"
        className="looper-length"
        value={looperLengthBars}
        onChange={event => setLooperLengthBars(Number(event.currentTarget.value) as LooperLengthBars)}>
        {LOOPER_LENGTH_OPTIONS.map(bars => (
          <option key={bars} value={bars}>{bars} bars</option>
        ))}
      </select>
      {isLooper ? (
        <span className="looper-layer-count" aria-label="Looper overdub layers">
          {layerCount} {layerCount === 1 ? 'layer' : 'layers'}
        </span>
      ) : null}
    </div>
  );
}
