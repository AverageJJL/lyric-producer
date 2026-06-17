import React from 'react';

import {
  TIME_SIGNATURE_DENOMINATORS,
  TIME_SIGNATURE_NUMERATORS,
  type TimeSignature,
} from '../../store/projectMetadata';
import {useDAWStore} from '../../store/useDAWStore';
import {
  meterMapEventAtBeat,
  tempoMapEventAtBeat,
  type TempoMapRamp,
} from '../../transport/tempoMap';

type TransportMeterControlProps = {
  children?: React.ReactNode;
  timeSignature: TimeSignature;
  onChange: (timeSignature: TimeSignature) => void;
};

const TIME_SIGNATURE_OPTIONS = TIME_SIGNATURE_NUMERATORS.flatMap(numerator =>
  TIME_SIGNATURE_DENOMINATORS.map(denominator => ({
    value: `${numerator}/${denominator}`,
    timeSignature: {numerator, denominator},
  })),
);

export function TransportMeterControl({
  children,
  timeSignature,
  onChange,
}: TransportMeterControlProps) {
  const [isMapOpen, setIsMapOpen] = React.useState(false);
  const [tempoRamp, setTempoRamp] = React.useState<TempoMapRamp>('jump');
  const controlRef = React.useRef<HTMLDivElement>(null);
  const bpm = useDAWStore(state => state.bpm);
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const tempoMap = useDAWStore(state => state.tempoMap);
  const meterMap = useDAWStore(state => state.meterMap);
  const setTempoMapEvent = useDAWStore(state => state.setTempoMapEvent);
  const clearTempoMapEvent = useDAWStore(state => state.removeTempoMapEventAtBeat);
  const setMeterMapEvent = useDAWStore(state => state.setMeterMapEvent);
  const clearMeterMapEvent = useDAWStore(state => state.removeMeterMapEventAtBeat);
  const hasTempoMarker = Boolean(tempoMapEventAtBeat(tempoMap, playheadBeat));
  const hasMeterMarker = Boolean(meterMapEventAtBeat(meterMap, playheadBeat));
  const update = (value: string) => {
    const next = TIME_SIGNATURE_OPTIONS.find(option => option.value === value);
    if (next) {
      onChange(next.timeSignature);
    }
  };
  const meterValue = `${timeSignature.numerator}/${timeSignature.denominator}`;

  React.useEffect(() => {
    if (!isMapOpen) {
      return undefined;
    }
    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (controlRef.current?.contains(target)) {
        return;
      }
      setIsMapOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMapOpen(false);
      }
    };
    window.addEventListener('pointerdown', closeOnPointerDown);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('pointerdown', closeOnPointerDown);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isMapOpen]);

  return (
    <div ref={controlRef} className="lcd-details meter-detail">
      <div className="lcd-project-values">
        <select
          aria-label="Time signature"
          className="meter-select"
          value={meterValue}
          onChange={event => update(event.currentTarget.value)}>
          {TIME_SIGNATURE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.value}</option>
          ))}
        </select>
        {children}
      </div>
      <button
        type="button"
        className="lcd-map-trigger"
        aria-label="LCD options"
        aria-haspopup="menu"
        aria-expanded={isMapOpen}
        onClick={() => setIsMapOpen(open => !open)}>
        <i aria-hidden="true" className="fa-solid fa-angle-down" />
      </button>
      {isMapOpen ? (
        <div className="tempo-map-menu" role="menu" aria-label="Tempo and meter map">
          <label className="tempo-map-menu-control">
            <span>Tempo Change</span>
            <select
              aria-label="Tempo map ramp"
              className="tempo-map-ramp"
              value={tempoRamp}
              onChange={event => setTempoRamp(event.currentTarget.value as TempoMapRamp)}>
              <option value="jump">Step</option>
              <option value="linear">Ramp</option>
            </select>
          </label>
          <button
            type="button"
            role="menuitem"
            aria-label="Add tempo map marker"
            className={hasTempoMarker ? 'active' : ''}
            onClick={() => setTempoMapEvent(playheadBeat, bpm, tempoRamp)}>
            Add Tempo Marker
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="Clear tempo map marker"
            disabled={!hasTempoMarker}
            onClick={() => clearTempoMapEvent(playheadBeat)}>
            Clear Tempo Marker
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="Add meter map marker"
            className={hasMeterMarker ? 'active' : ''}
            onClick={() => setMeterMapEvent(playheadBeat, timeSignature)}>
            Add Meter Marker
          </button>
          <button
            type="button"
            role="menuitem"
            aria-label="Clear meter map marker"
            disabled={!hasMeterMarker}
            onClick={() => clearMeterMapEvent(playheadBeat)}>
            Clear Meter Marker
          </button>
          <span className="tempo-map-count">{tempoMap.length + meterMap.length} map markers</span>
        </div>
      ) : null}
    </div>
  );
}
