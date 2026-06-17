import React from 'react';

import type {DAWNote} from '../../store/useDAWStore';
import {noteRow, PIANO_ROLL_LANE_COUNT} from './pianoRollGeometry';

export type PianoRollMarqueeSession = {
  pointerId: number;
  originX: number;
  originY: number;
  additive: boolean;
  gridWidth: number;
  gridHeight: number;
};

export function noteDeltaFromGridY(deltaY: number, gridHeight: number): number {
  return -Math.round(deltaY / (Math.max(1, gridHeight) / PIANO_ROLL_LANE_COUNT));
}

export function pianoRollMarqueeStyle(
  session: PianoRollMarqueeSession,
  x: number,
  y: number,
): React.CSSProperties {
  const left = Math.min(session.originX, x);
  const top = Math.min(session.originY, y);
  return {left, top, width: Math.abs(x - session.originX), height: Math.abs(y - session.originY)};
}

export function pianoRollMarqueeIndexes(
  notes: DAWNote[],
  session: PianoRollMarqueeSession,
  x: number,
  y: number,
  clipLengthBeats: number,
): number[] {
  const rect = pianoRollMarqueeStyle(session, x, y);
  const rowHeight = Math.max(1, session.gridHeight) / PIANO_ROLL_LANE_COUNT;
  const safeLength = Math.max(0.125, clipLengthBeats);
  return notes.flatMap((note, index) => {
    const left = (note.startBeat / safeLength) * session.gridWidth;
    const right = ((note.startBeat + note.lengthBeats) / safeLength) * session.gridWidth;
    const top = noteRow(note.note) * rowHeight;
    const bottom = top + rowHeight;
    const overlaps = right >= Number(rect.left) && left <= Number(rect.left) + Number(rect.width) &&
      bottom >= Number(rect.top) && top <= Number(rect.top) + Number(rect.height);
    return overlaps ? [index] : [];
  });
}
