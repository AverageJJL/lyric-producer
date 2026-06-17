import React from 'react';

import type {TrackFxState} from '../../../native/fxContract';
import {getReverbParams, updateFxSlot} from '../../../native/fxContractOps';
import {FxParamControl} from './FxParamControl';

type ReverbEditorProps = {
  state: TrackFxState;
  onCommit: (next: TrackFxState) => void;
};

function reverbRoomLabel(size: number): string {
  if (size < 0.33) {
    return 'Tight';
  }
  if (size < 0.66) {
    return 'Natural';
  }
  return 'Huge';
}

export function ReverbEditor({state, onCommit}: ReverbEditorProps) {
  const params = getReverbParams(state);
  const roomWidth = 24 + params.size * 56;
  const wetHeight = 8 + params.mix * 48;

  const patch = (patchParams: Partial<typeof params>) => {
    onCommit(updateFxSlot(state, 'reverb', {params: {...params, ...patchParams}}));
  };

  return (
    <div className="fx-editor reverb-editor">
      <div className="reverb-visual" aria-hidden="true">
        <div className="reverb-room" style={{width: roomWidth, height: roomWidth}}>
          <div className="reverb-wet" style={{height: wetHeight}} />
        </div>
        <span className="reverb-hint">{reverbRoomLabel(params.size)} room</span>
      </div>
      <FxParamControl
        label="Size"
        value={params.size}
        min={0}
        max={1}
        step={0.01}
        format={v => `${Math.round(v * 100)}%`}
        onChange={size => patch({size})}
      />
      <FxParamControl
        label="Mix"
        value={params.mix}
        min={0}
        max={1}
        step={0.01}
        format={v => `${Math.round(v * 100)}%`}
        onChange={mix => patch({mix})}
      />
      <FxParamControl
        label="Pre-delay"
        value={params.preDelay}
        min={0}
        max={200}
        step={1}
        unit=" ms"
        onChange={preDelay => patch({preDelay})}
      />
    </div>
  );
}
