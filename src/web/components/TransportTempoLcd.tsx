import React from 'react';

import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import type {TimeSignature} from '../../store/projectMetadata';
import {useDAWStore} from '../../store/useDAWStore';
import {TransportMeterControl} from './TransportMeterControl';
import {TransportPosition} from './TransportPosition';
import {TransportProjectKeyControl} from './TransportProjectKeyControl';

const WHEEL_COMMIT_DELAY_MS = 200;
const TEMPO_DRAG_PIXELS_PER_BPM = 8;

type TransportTempoLcdProps = {
  bpm: number;
  timeSignature: TimeSignature;
  minBpm: number;
  maxBpm: number;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (timeSignature: TimeSignature) => void;
};

type TempoDragSession = {
  pointerId: number;
  originY: number;
  originBpm: number;
  lastBpm: number;
  hasMoved: boolean;
};

function clampTempo(value: number, minBpm: number, maxBpm: number): number {
  return Math.min(maxBpm, Math.max(minBpm, Math.round(value)));
}

function parseTempoDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }
  return Number(trimmed);
}

export function TransportTempoLcd({
  bpm,
  timeSignature,
  minBpm,
  maxBpm,
  onBpmChange,
  onTimeSignatureChange,
}: TransportTempoLcdProps) {
  const scale = useDAWStore(state => state.scale);
  const setScale = useDAWStore(state => state.setScale);
  const [draftBpm, setDraftBpm] = React.useState(String(bpm));
  const [isEditingTempo, setIsEditingTempo] = React.useState(false);
  const latestBpmRef = React.useRef(bpm);
  const dragSessionRef = React.useRef<TempoDragSession | null>(null);
  const wheelDraftRef = React.useRef<number | null>(null);
  const wheelCommitTimerRef = React.useRef<number | null>(null);

  const commitNumericBpm = React.useCallback(
    (value: number) => {
      const clamped = clampTempo(value, minBpm, maxBpm);
      const currentBpm = latestBpmRef.current;
      latestBpmRef.current = clamped;
      setDraftBpm(String(clamped));
      setIsEditingTempo(false);
      if (clamped !== currentBpm) {
        onBpmChange(clamped);
      }
    },
    [maxBpm, minBpm, onBpmChange],
  );

  const clearWheelCommit = React.useCallback(() => {
    if (wheelCommitTimerRef.current !== null) {
      window.clearTimeout(wheelCommitTimerRef.current);
      wheelCommitTimerRef.current = null;
    }
  }, []);

  const commitPendingWheel = React.useCallback(() => {
    clearWheelCommit();
    const pendingBpm = wheelDraftRef.current;
    wheelDraftRef.current = null;
    if (pendingBpm !== null) {
      commitNumericBpm(pendingBpm);
    }
  }, [clearWheelCommit, commitNumericBpm]);

  React.useEffect(() => {
    latestBpmRef.current = bpm;
    if (!isEditingTempo && !dragSessionRef.current && wheelCommitTimerRef.current === null) {
      setDraftBpm(String(bpm));
    }
  }, [bpm, isEditingTempo]);

  React.useEffect(() => () => clearWheelCommit(), [clearWheelCommit]);

  const commitDraftTempo = React.useCallback(() => {
    const parsedBpm = parseTempoDraft(draftBpm);
    if (parsedBpm === null) {
      setDraftBpm(String(latestBpmRef.current));
      setIsEditingTempo(false);
      return;
    }
    commitNumericBpm(parsedBpm);
  }, [commitNumericBpm, draftBpm]);

  const handleTempoWheel = (event: React.WheelEvent<HTMLInputElement>) => {
    event.preventDefault();
    const direction = event.deltaY < 0 ? 1 : event.deltaY > 0 ? -1 : 0;
    if (direction === 0) {
      return;
    }
    clearWheelCommit();
    const baseBpm = wheelDraftRef.current ?? parseTempoDraft(draftBpm) ?? latestBpmRef.current;
    const nextBpm = clampTempo(baseBpm + direction, minBpm, maxBpm);
    wheelDraftRef.current = nextBpm;
    setIsEditingTempo(false);
    setDraftBpm(String(nextBpm));
    wheelCommitTimerRef.current = window.setTimeout(() => {
      const pendingBpm = wheelDraftRef.current;
      wheelCommitTimerRef.current = null;
      wheelDraftRef.current = null;
      if (pendingBpm !== null) {
        commitNumericBpm(pendingBpm);
      }
    }, WHEEL_COMMIT_DELAY_MS);
  };

  const handleTempoPointerDown = (event: React.PointerEvent<HTMLInputElement>) => {
    if (event.button !== undefined && event.button !== 0) {
      return;
    }
    commitPendingWheel();
    const originBpm = clampTempo(parseTempoDraft(draftBpm) ?? latestBpmRef.current, minBpm, maxBpm);
    dragSessionRef.current = {
      pointerId: event.pointerId,
      originY: Number.isFinite(event.clientY) ? event.clientY : event.pageY ?? 0,
      originBpm,
      lastBpm: originBpm,
      hasMoved: false,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const handleTempoPointerMove = (event: React.PointerEvent<HTMLInputElement>) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const currentY = Number.isFinite(event.clientY) ? event.clientY : event.pageY ?? session.originY;
    const distanceY = session.originY - currentY;
    const dragSteps =
      distanceY >= 0
        ? Math.floor(distanceY / TEMPO_DRAG_PIXELS_PER_BPM)
        : Math.ceil(distanceY / TEMPO_DRAG_PIXELS_PER_BPM);
    const nextBpm = clampTempo(session.originBpm + dragSteps, minBpm, maxBpm);
    if (nextBpm !== session.lastBpm) {
      session.hasMoved = true;
      session.lastBpm = nextBpm;
      setIsEditingTempo(false);
      setDraftBpm(String(nextBpm));
      event.preventDefault();
    }
  };

  const finishTempoPointer = (event: React.PointerEvent<HTMLInputElement>, shouldCommit: boolean) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragSessionRef.current = null;
    if (shouldCommit && session.hasMoved) {
      commitNumericBpm(session.lastBpm);
      return;
    }
    if (!shouldCommit) {
      setDraftBpm(String(latestBpmRef.current));
      setIsEditingTempo(false);
    }
  };

  return (
    <div className="lcd-display lcd-display-centered" aria-label="Project display">
      <TransportPosition timeSignature={timeSignature} />
      <div className="lcd-details tempo-detail lcd-tempo-center">
        <input
          aria-label="Tempo BPM"
          className="tempo-input"
          data-guide-target={GUIDE_TARGET_IDS['bpm-control']}
          inputMode="numeric"
          maxLength={3}
          spellCheck={false}
          type="text"
          value={draftBpm}
          onBlur={commitDraftTempo}
          onChange={event => {
            setIsEditingTempo(true);
            setDraftBpm(event.currentTarget.value);
          }}
          onFocus={() => {
            commitPendingWheel();
            setIsEditingTempo(true);
            setDraftBpm(String(latestBpmRef.current));
          }}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitDraftTempo();
              event.currentTarget.blur();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setDraftBpm(String(latestBpmRef.current));
              setIsEditingTempo(false);
              event.currentTarget.blur();
            }
          }}
          onPointerCancel={event => finishTempoPointer(event, false)}
          onPointerDown={handleTempoPointerDown}
          onPointerMove={handleTempoPointerMove}
          onPointerUp={event => finishTempoPointer(event, true)}
          onWheel={handleTempoWheel}
        />
        <span className="lcd-field-label">Tempo</span>
      </div>
      <div className="lcd-project-column">
        <TransportMeterControl timeSignature={timeSignature} onChange={onTimeSignatureChange}>
          <TransportProjectKeyControl scale={scale} onChange={setScale} />
        </TransportMeterControl>
      </div>
    </div>
  );
}
