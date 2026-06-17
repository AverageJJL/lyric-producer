import React, {useCallback, useMemo, useRef, useState} from 'react';

import {clampEqBand, clampEqBands} from '../../../native/fxClamps';
import type {EqBand, EqFxParams, TrackFxState} from '../../../native/fxContract';
import {
  getEqParams,
  getFxSlot,
  seedEqBandsIfEmpty,
  updateFxSlot,
} from '../../../native/fxContractOps';
import {
  eqCurveToSvgPath,
  formatDb,
  formatHz,
  freqToPlotX,
  gainToPlotY,
  plotXToFreq,
  plotYToGain,
} from '../../../music/fxDisplayLayout';
import {FxParamControl} from './FxParamControl';

const PLOT_WIDTH = 260;
const PLOT_HEIGHT = 120;

type EqCurveEditorProps = {
  state: TrackFxState;
  onCommit: (next: TrackFxState) => void;
};

export function EqCurveEditor({state, onCommit}: EqCurveEditorProps) {
  const eq = getEqParams(state);
  const bands = eq.bands.length > 0 ? eq.bands : [];
  const curve = eq.curve ?? [];
  const [selectedBand, setSelectedBand] = useState(0);
  const dragRef = useRef<{bandIndex: number; pointerId: number} | null>(null);

  const curvePath = useMemo(
    () => eqCurveToSvgPath(curve, {width: PLOT_WIDTH, height: PLOT_HEIGHT}),
    [curve],
  );

  const commitBands = useCallback(
    (nextBands: EqBand[]) => {
      const params: EqFxParams = {bands: clampEqBands(nextBands)};
      onCommit(updateFxSlot(state, 'eq', {params}));
    },
    [onCommit, state],
  );

  const commitBandAt = useCallback(
    (index: number, patch: Partial<EqBand>) => {
      const base = bands.length > 0 ? bands : [];
      const next = [...base];
      while (next.length <= index) {
        next.push({freq: 1000, q: 0.5, gain: 0});
      }
      next[index] = clampEqBand({...next[index], ...patch});
      commitBands(next);
    },
    [bands, commitBands],
  );

  const startBandDrag = (bandIndex: number, event: React.PointerEvent<SVGCircleElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {bandIndex, pointerId: event.pointerId};
  };

  const moveBandDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    commitBandAt(session.bandIndex, {
      freq: plotXToFreq(x, PLOT_WIDTH),
      gain: plotYToGain(y, PLOT_HEIGHT),
    });
  };

  const endBandDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const activeBand = bands[selectedBand] ?? {freq: 1000, q: 0.5, gain: 0};

  const ensureBandsAndEnable = () => {
    let next = seedEqBandsIfEmpty(state);
    if (!getFxSlot(next, 'eq').enabled) {
      next = updateFxSlot(next, 'eq', {enabled: true});
    }
    onCommit(next);
  };

  return (
    <div className="fx-editor eq-editor">
      <svg
        className="eq-plot"
        viewBox={`0 0 ${PLOT_WIDTH} ${PLOT_HEIGHT}`}
        role="img"
        aria-label="EQ frequency response"
        onPointerMove={moveBandDrag}
        onPointerUp={endBandDrag}
        onPointerCancel={endBandDrag}>
        <rect className="eq-plot-bg" width={PLOT_WIDTH} height={PLOT_HEIGHT} />
        <line
          className="eq-zero-line"
          x1={0}
          y1={gainToPlotY(0, PLOT_HEIGHT)}
          x2={PLOT_WIDTH}
          y2={gainToPlotY(0, PLOT_HEIGHT)}
        />
        {curvePath ? <path className="eq-curve" d={curvePath} /> : null}
        {bands.map((band, index) => (
          <circle
            key={`band-${index}`}
            className={`eq-node ${selectedBand === index ? 'selected' : ''}`}
            cx={freqToPlotX(band.freq, PLOT_WIDTH)}
            cy={gainToPlotY(band.gain, PLOT_HEIGHT)}
            r={6}
            onPointerDown={event => {
              setSelectedBand(index);
              startBandDrag(index, event);
            }}
          />
        ))}
      </svg>
      {bands.length === 0 ? (
        <button type="button" className="fx-seed-button" onClick={ensureBandsAndEnable}>
          Initialize 4-band EQ
        </button>
      ) : (
        <div className="eq-band-controls">
          <div className="eq-band-tabs">
            {bands.map((_, index) => (
              <button
                key={`tab-${index}`}
                type="button"
                className={selectedBand === index ? 'active' : ''}
                onClick={() => setSelectedBand(index)}>
                B{index + 1}
              </button>
            ))}
          </div>
          <FxParamControl
            label="Freq"
            value={activeBand.freq}
            min={20}
            max={20000}
            step={1}
            format={formatHz}
            onChange={freq => commitBandAt(selectedBand, {freq})}
          />
          <FxParamControl
            label="Gain"
            value={activeBand.gain}
            min={-20}
            max={20}
            step={0.1}
            format={formatDb}
            onChange={gain => commitBandAt(selectedBand, {gain})}
          />
          <FxParamControl
            label="Q"
            value={activeBand.q}
            min={0.1}
            max={4}
            step={0.05}
            onChange={q => commitBandAt(selectedBand, {q})}
          />
        </div>
      )}
    </div>
  );
}
