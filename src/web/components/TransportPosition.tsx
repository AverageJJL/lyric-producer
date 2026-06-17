import React from 'react';

import {
  beatUnitForTimeSignature,
  beatsPerBarForTimeSignature,
  normalizeTimeSignature,
  type TimeSignature,
} from '../../store/projectMetadata';
import {useDAWStore} from '../../store/useDAWStore';

type TransportPositionProps = {
  timeSignature: TimeSignature;
};

export function formatTransportPosition(
  playheadBeat: number,
  timeSignature: TimeSignature,
): {barLabel: string; beatLabel: string} {
  const safePlayheadBeat = Math.max(0, Number.isFinite(playheadBeat) ? playheadBeat : 0);
  const normalized = normalizeTimeSignature(timeSignature);
  const beatsPerBar = beatsPerBarForTimeSignature(timeSignature);
  const beatUnit = beatUnitForTimeSignature(timeSignature);
  const barIndex = Math.floor(safePlayheadBeat / beatsPerBar);
  const beatInBar = safePlayheadBeat - barIndex * beatsPerBar;
  const beat = Math.min(normalized.numerator, Math.floor((beatInBar + 1e-6) / beatUnit) + 1);

  return {
    barLabel: String(barIndex + 1).padStart(3, '0'),
    beatLabel: String(beat),
  };
}

export function TransportPosition({timeSignature}: TransportPositionProps) {
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const position = formatTransportPosition(playheadBeat, timeSignature);

  return (
    <div className="lcd-position" aria-label="Transport position">
      <div className="lcd-position-cell">
        <span>{position.barLabel}</span>
        <small>Bar</small>
      </div>
      <div className="lcd-position-cell">
        <strong>{position.beatLabel}</strong>
        <small>Beat</small>
      </div>
    </div>
  );
}
