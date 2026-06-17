import React from 'react';

import {useDAWStore} from '../../store/useDAWStore';

function beatLabel(beat: number): string {
  return String(Math.floor(Math.max(0, beat)) + 1).padStart(3, '0');
}

type TransportCycleControlProps = {
  variant?: 'default' | 'compact';
};

export function TransportCycleControl({variant = 'default'}: TransportCycleControlProps) {
  const isCycleEnabled = useDAWStore(state => state.isCycleEnabled);
  const cycleStartBeat = useDAWStore(state => state.cycleStartBeat);
  const cycleEndBeat = useDAWStore(state => state.cycleEndBeat);
  const setCycleEnabled = useDAWStore(state => state.setCycleEnabled);

  if (variant === 'compact') {
    return (
      <button
        className={`transport-icon-button cycle-toggle ${isCycleEnabled ? 'active' : ''}`}
        type="button"
        aria-label="Cycle playback"
        aria-pressed={isCycleEnabled}
        onClick={() => setCycleEnabled(!isCycleEnabled)}>
        <span className="sr-only" aria-label="Cycle range">
          {beatLabel(cycleStartBeat)}-{beatLabel(cycleEndBeat)}
        </span>
        <svg className="cycle-loop-icon" viewBox="0 0 120 120" aria-hidden="true">
          <g
            fill="none"
            stroke="currentColor"
            strokeWidth="12"
            strokeLinecap="round"
            strokeLinejoin="round">
            <path d="M 20 55 A 30 30 0 0 1 50 25 L 90 25" />
            <path d="M 72 7 L 90 25 L 72 43" />
            <path d="M 100 65 A 30 30 0 0 1 70 95 L 30 95" />
            <path d="M 48 113 L 30 95 L 48 77" />
          </g>
        </svg>
      </button>
    );
  }

  return (
    <div className="cycle-control">
      <button
        className={`cycle-toggle ${isCycleEnabled ? 'active' : ''}`}
        type="button"
        aria-label="Cycle playback"
        aria-pressed={isCycleEnabled}
        onClick={() => setCycleEnabled(!isCycleEnabled)}>
        Cycle
      </button>
      <span aria-label="Cycle range">
        {beatLabel(cycleStartBeat)}-{beatLabel(cycleEndBeat)}
      </span>
    </div>
  );
}
