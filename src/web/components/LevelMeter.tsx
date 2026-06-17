import React from 'react';

import type {MeterValue} from '../../store/mixMeterStore';
import {useMixMeterStore} from '../../store/mixMeterStore';

type LevelMeterProps = {
  peak?: MeterValue;
  peakHold?: MeterValue;
  clipping?: boolean;
  label: string;
};

function percentForDb(db: number | undefined): number {
  const value = typeof db === 'number' && Number.isFinite(db) ? db : -100;
  const clamped = Math.max(-60, Math.min(6, value));
  return ((clamped + 60) / 66) * 100;
}

export function LevelMeter({peak, peakHold, clipping, label}: LevelMeterProps) {
  const peakPercent = percentForDb(peak?.db);
  const holdPercent = percentForDb(peakHold?.db);

  return (
    <div
      className={`level-meter ${clipping ? 'clipping' : ''}`}
      aria-label={label}
      role="meter"
      aria-valuemin={-60}
      aria-valuemax={6}
      aria-valuenow={Math.round(peak?.db ?? -100)}>
      <span className="level-meter-fill" style={{width: `${peakPercent}%`}} />
      <span className="level-meter-hold" style={{left: `${holdPercent}%`}} />
    </div>
  );
}

export function TrackLevelMeter({
  trackId,
  label,
}: {
  trackId: string;
  label: string;
}) {
  const meter = useMixMeterStore(state => state.snapshot?.tracks[trackId] ?? null);

  return (
    <LevelMeter
      peak={meter?.peak}
      peakHold={meter?.peakHold}
      clipping={meter?.clipping}
      label={label}
    />
  );
}

export function MasterLevelMeter() {
  const meter = useMixMeterStore(state => state.snapshot?.master ?? null);

  return (
    <LevelMeter
      peak={meter?.peak}
      peakHold={meter?.peakHold}
      clipping={meter?.clipping}
      label="Native master level meter"
    />
  );
}

export function InputMeterStatus() {
  const isActive = useMixMeterStore(state => state.snapshot?.input.active === true);

  return <>{isActive ? 'Input live' : 'Input idle'}</>;
}

export function InputLevelMeter() {
  const meter = useMixMeterStore(state => state.snapshot?.input ?? null);

  return (
    <LevelMeter
      peak={meter?.peak}
      peakHold={meter?.peakHold}
      clipping={meter?.clipping}
      label="Native input level meter"
    />
  );
}
