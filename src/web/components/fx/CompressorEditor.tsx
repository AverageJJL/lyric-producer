import React, {useMemo} from 'react';

import type {TrackFxState} from '../../../native/fxContract';
import {getCompressorParams, updateFxSlot} from '../../../native/fxContractOps';
import {compressorTransferToSvgPath} from '../../../music/fxDisplayLayout';
import {FxParamControl} from './FxParamControl';

const PLOT_SIZE = {width: 200, height: 100};

type CompressorEditorProps = {
  state: TrackFxState;
  onCommit: (next: TrackFxState) => void;
};

export function CompressorEditor({state, onCommit}: CompressorEditorProps) {
  const params = getCompressorParams(state);

  const transferPath = useMemo(
    () => compressorTransferToSvgPath(params.threshold, params.ratio, PLOT_SIZE),
    [params.threshold, params.ratio],
  );

  const patch = (patchParams: Partial<typeof params>) => {
    onCommit(
      updateFxSlot(state, 'compressor', {
        params: {...params, ...patchParams},
      }),
    );
  };

  return (
    <div className="fx-editor compressor-editor">
      <svg
        className="compressor-plot"
        viewBox={`0 0 ${PLOT_SIZE.width} ${PLOT_SIZE.height}`}
        role="img"
        aria-label="Compressor transfer curve">
        <rect className="compressor-plot-bg" width={PLOT_SIZE.width} height={PLOT_SIZE.height} />
        <line
          className="compressor-diagonal"
          x1={0}
          y1={PLOT_SIZE.height}
          x2={PLOT_SIZE.width}
          y2={0}
        />
        {transferPath ? <path className="compressor-curve" d={transferPath} /> : null}
      </svg>
      <FxParamControl
        label="Threshold"
        value={params.threshold}
        min={-40}
        max={0}
        step={0.5}
        unit=" dB"
        onChange={threshold => patch({threshold})}
      />
      <FxParamControl
        label="Ratio"
        value={params.ratio}
        min={1}
        max={20}
        step={0.1}
        format={v => `${Math.round(v * 10) / 10}:1`}
        onChange={ratio => patch({ratio})}
      />
      <FxParamControl
        label="Attack"
        value={params.attack}
        min={0.3}
        max={200}
        step={0.1}
        unit=" ms"
        onChange={attack => patch({attack})}
      />
      <FxParamControl
        label="Release"
        value={params.release}
        min={10}
        max={300}
        step={1}
        unit=" ms"
        onChange={release => patch({release})}
      />
    </div>
  );
}
