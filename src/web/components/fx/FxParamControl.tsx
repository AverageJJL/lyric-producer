import React, {useCallback, useId, useRef} from 'react';

type FxParamControlProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  isAiTargeted?: boolean;
  onDraftChange: (value: number) => void;
  onCommit: () => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function valueFromPointer(
  clientY: number,
  rect: DOMRect,
  min: number,
  max: number,
): number {
  const height = Math.max(1, rect.height);
  const t = 1 - (clientY - rect.top) / height;
  return clamp(min + t * (max - min), min, max);
}

export function FxParamControl({
  label,
  value,
  min,
  max,
  step = 0.01,
  format,
  isAiTargeted = false,
  onDraftChange,
  onCommit,
}: FxParamControlProps) {
  const labelId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const valueRef = useRef(value);
  valueRef.current = value;

  const display = format ? format(value) : `${Math.round(value * 1000) / 10}%`;
  const fillPercent = ((value - min) / (max - min)) * 100;

  const applyPointer = useCallback(
    (clientY: number) => {
      const track = trackRef.current;
      if (!track) {
        return;
      }
      onDraftChange(valueFromPointer(clientY, track.getBoundingClientRect(), min, max));
    },
    [max, min, onDraftChange],
  );

  const endDrag = () => {
    if (!draggingRef.current) {
      return;
    }
    draggingRef.current = false;
    onCommit();
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    if (event.currentTarget.setPointerCapture) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    applyPointer(event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) {
      return;
    }
    applyPointer(event.clientY);
  };

  const handlePointerUp = () => {
    endDrag();
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    draggingRef.current = true;
    applyPointer(event.clientY);
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!draggingRef.current || event.buttons !== 1) {
      return;
    }
    applyPointer(event.clientY);
  };

  const handleMouseUp = () => {
    endDrag();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    const delta = event.key === 'ArrowUp' || event.key === 'ArrowRight' ? step : 0;
    const negative =
      event.key === 'ArrowDown' || event.key === 'ArrowLeft' ? step : 0;
    if (delta === 0 && negative === 0) {
      return;
    }
    event.preventDefault();
    onDraftChange(clamp(valueRef.current + delta - negative, min, max));
  };

  return (
    <div
      className={`fx-param ${isAiTargeted ? 'ai-targeted' : ''}`}
      role="group"
      aria-labelledby={labelId}
      data-ai-targeted={isAiTargeted ? 'true' : undefined}>
      <span className="fx-param-label" id={labelId}>
        {label}
      </span>
      <div
        ref={trackRef}
        className="fx-param-fader"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}>
        <div className="fx-param-fader-track" />
        <div className="fx-param-fader-fill" style={{height: `${fillPercent}%`}} />
        <div className="fx-param-fader-thumb" style={{bottom: `${fillPercent}%`}} />
      </div>
      <span className="fx-param-value">{display}</span>
      <input
        type="range"
        className="fx-param-range-sr"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-labelledby={labelId}
        onChange={event => onDraftChange(Number(event.target.value))}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
      />
    </div>
  );
}
