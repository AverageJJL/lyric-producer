import type {CSSProperties} from 'react';

import {sanitizePianoRollNote} from '../../arrangement/midiNoteEditCommands';
import {quantizeBeat} from '../../music/noteUtils';
import type {TimeSignature} from '../../store/projectMetadata';
import type {DAWNote} from '../../store/useDAWStore';
import type {MeterMapEvent} from '../../transport/tempoMap';
import {buildTimelineRulerModel} from '../../ui/timelineRulerMap';

export const PIANO_ROLL_MIN_NOTE = 36;
export const PIANO_ROLL_MAX_NOTE = 84;
export const PIANO_ROLL_RULER_HEIGHT = 22;
export const MIN_PIANO_ROLL_PIXELS_PER_BEAT = 72;
export const DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT = 160;
export const MAX_PIANO_ROLL_PIXELS_PER_BEAT = 320;
export const MIN_PIANO_ROLL_LANE_HEIGHT = 14;
export const DEFAULT_PIANO_ROLL_LANE_HEIGHT = 24;
export const MAX_PIANO_ROLL_LANE_HEIGHT = 44;

export const PIANO_ROLL_NOTES = Array.from(
  {length: PIANO_ROLL_MAX_NOTE - PIANO_ROLL_MIN_NOTE + 1},
  (_, index) => PIANO_ROLL_MAX_NOTE - index,
);
export const PIANO_ROLL_LANE_COUNT = PIANO_ROLL_NOTES.length;

const BLACK_KEY_CLASSES = new Set([1, 3, 6, 8, 10]);
const GRID_EPSILON = 1e-6;

export type PianoRollGridLine = {
  key: string;
  left: string;
  kind: 'bar' | 'beat' | 'subdivision';
};

export type PianoRollRulerTick = {
  key: string;
  left: string;
  label: string;
};

export type PianoRollGridModel = {
  gridLines: PianoRollGridLine[];
  rulerTicks: PianoRollRulerTick[];
};

export type PianoRollKeyColor = 'white' | 'black';
export type PianoRollKeyVisualStyle = CSSProperties & {
  '--black-key-height'?: string;
};

export type PianoRollKeyboardSeam = {
  key: string;
  top: string;
};

export function isBlackPianoKey(note: number): boolean {
  return BLACK_KEY_CLASSES.has(note % 12);
}

export function noteRow(note: number): number {
  return Math.max(
    0,
    Math.min(PIANO_ROLL_LANE_COUNT - 1, PIANO_ROLL_MAX_NOTE - Math.round(note)),
  );
}

function laneHeight(containerHeight: number): number {
  return Math.max(1, containerHeight) / PIANO_ROLL_LANE_COUNT;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function noteTopPercent(note: number): string {
  return `${(noteRow(note) / PIANO_ROLL_LANE_COUNT) * 100}%`;
}

function laneHeightPercent(): string {
  return `${100 / PIANO_ROLL_LANE_COUNT}%`;
}

function rowPercent(row: number): number {
  return (row / PIANO_ROLL_LANE_COUNT) * 100;
}

export function pianoRollKeyColor(note: number): PianoRollKeyColor {
  return isBlackPianoKey(note) ? 'black' : 'white';
}

export function pianoRollKeyStyle(note: number): PianoRollKeyVisualStyle {
  const row = noteRow(note);
  const rowHeight = 100 / PIANO_ROLL_LANE_COUNT;
  const width = isBlackPianoKey(note) ? '64%' : '100%';

  return {
    top: `${rowPercent(row)}%`,
    height: `${rowHeight}%`,
    width,
    '--black-key-height': '100%',
  };
}

export function pianoRollEditorSurfaceHeight(surfaceHeight: number): number {
  return surfaceHeight + PIANO_ROLL_RULER_HEIGHT;
}

export function pianoRollKeyboardSeamStyles(): PianoRollKeyboardSeam[] {
  const rowHeight = 100 / PIANO_ROLL_LANE_COUNT;
  const seamTops = new Map<string, number>();

  for (let index = 0; index < PIANO_ROLL_NOTES.length - 1; index += 1) {
    const upperNote = PIANO_ROLL_NOTES[index] ?? PIANO_ROLL_MAX_NOTE;
    const lowerNote = PIANO_ROLL_NOTES[index + 1] ?? PIANO_ROLL_MIN_NOTE;
    const blackNote = isBlackPianoKey(upperNote)
      ? upperNote
      : isBlackPianoKey(lowerNote)
        ? lowerNote
        : null;
    const seamTop = blackNote === null
      ? (index + 1) * rowHeight
      : (noteRow(blackNote) + 0.5) * rowHeight;
    seamTops.set(seamTop.toFixed(6), seamTop);
  }

  return [...seamTops.values()].map(top => ({
    key: `seam-${top.toFixed(6)}`,
    top: `${top}%`,
  }));
}

function leftPercent(
  absoluteBeat: number,
  clipStartBeat: number,
  clipLengthBeats: number,
): string {
  const safeLength = Math.max(0.125, clipLengthBeats);
  const relativeBeat = absoluteBeat - clipStartBeat;
  const percent = Math.max(0, Math.min(100, (relativeBeat / safeLength) * 100));
  return `${percent}%`;
}

function isWithinClip(beat: number, clipStartBeat: number, clipEndBeat: number): boolean {
  return beat >= clipStartBeat - GRID_EPSILON && beat <= clipEndBeat + GRID_EPSILON;
}

export function clampPianoRollPixelsPerBeat(value: number): number {
  return Math.min(
    MAX_PIANO_ROLL_PIXELS_PER_BEAT,
    Math.max(MIN_PIANO_ROLL_PIXELS_PER_BEAT, Math.round(finiteOr(value, DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT))),
  );
}

export function clampPianoRollLaneHeight(value: number): number {
  return Math.min(
    MAX_PIANO_ROLL_LANE_HEIGHT,
    Math.max(MIN_PIANO_ROLL_LANE_HEIGHT, Math.round(finiteOr(value, DEFAULT_PIANO_ROLL_LANE_HEIGHT))),
  );
}

export function pianoRollSurfaceHeight(laneHeight: number): number {
  return PIANO_ROLL_LANE_COUNT * clampPianoRollLaneHeight(laneHeight);
}

export function pianoRollSurfaceWidth(clipLengthBeats: number, pixelsPerBeat: number): number {
  const safeLength = Math.max(0.125, finiteOr(clipLengthBeats, 0.125));
  return Math.ceil(safeLength * clampPianoRollPixelsPerBeat(pixelsPerBeat));
}

export function buildPianoRollGridModel({
  clipStartBeat,
  clipLengthBeats,
  timeSignature,
  meterMap,
}: {
  clipStartBeat: number;
  clipLengthBeats: number;
  timeSignature: TimeSignature;
  meterMap: MeterMapEvent[];
}): PianoRollGridModel {
  const safeStart = Math.max(0, clipStartBeat);
  const safeLength = Math.max(0.125, clipLengthBeats);
  const clipEndBeat = safeStart + safeLength;
  const model = buildTimelineRulerModel({
    visibleTimelineBeats: clipEndBeat,
    snapGrid: '1/16',
    timeSignature,
    meterMap,
    tempoMap: [],
  });

  return {
    gridLines: model.gridLines
      .filter(line => isWithinClip(line.beat, safeStart, clipEndBeat))
      .map(line => ({
        key: `grid-${line.beat}`,
        left: leftPercent(line.beat, safeStart, safeLength),
        kind: line.kind,
      })),
    rulerTicks: model.rulerTicks
      .filter(tick => tick.label && isWithinClip(tick.beat, safeStart, clipEndBeat))
      .map(tick => ({
        key: `ruler-${tick.beat}`,
        left: leftPercent(tick.beat, safeStart, safeLength),
        label: tick.label ?? '',
      })),
  };
}

export function noteFromGridY(y: number, gridHeight: number): number {
  const row = Math.max(
    0,
    Math.min(PIANO_ROLL_LANE_COUNT - 1, Math.floor(y / laneHeight(gridHeight))),
  );
  return PIANO_ROLL_NOTES[row] ?? 60;
}

export function beatFromGridX(x: number, width: number, clipLengthBeats: number): number {
  const safeWidth = Math.max(1, width);
  const ratio = Math.max(0, Math.min(1, x / safeWidth));
  return ratio * Math.max(0.125, clipLengthBeats);
}

export function pianoRollNoteStyle(
  note: DAWNote,
  clipLengthBeats: number,
): CSSProperties {
  const safeLength = Math.max(0.125, clipLengthBeats);
  const left = Math.max(0, Math.min(100, (note.startBeat / safeLength) * 100));
  const width = Math.max(
    1.5,
    Math.min(100 - left, (note.lengthBeats / safeLength) * 100),
  );
  return {
    left: `${left}%`,
    width: `${width}%`,
    top: noteTopPercent(note.note),
    height: laneHeightPercent(),
  };
}

export function draggedPianoRollNote(
  note: DAWNote,
  deltaX: number,
  deltaY: number,
  width: number,
  height: number,
  clipLengthBeats: number,
): DAWNote {
  const safeWidth = Math.max(1, width);
  const beatDelta = (deltaX / safeWidth) * Math.max(0.125, clipLengthBeats);
  const noteDelta = -Math.round(deltaY / laneHeight(height));
  return sanitizePianoRollNote(
    {
      ...note,
      note: note.note + noteDelta,
      startBeat: quantizeBeat(note.startBeat + beatDelta),
    },
    clipLengthBeats,
  );
}

export function draftPianoRollNote(
  relativeBeat: number,
  note: number,
  rememberedLengthBeats: number,
  deltaX: number,
  width: number,
  clipLengthBeats: number,
): DAWNote {
  const safeWidth = Math.max(1, width);
  const beatDelta = (deltaX / safeWidth) * Math.max(0.125, clipLengthBeats);
  return sanitizePianoRollNote(
    {
      note,
      velocity: 100,
      startBeat: quantizeBeat(relativeBeat),
      lengthBeats: quantizeBeat(rememberedLengthBeats + beatDelta),
    },
    clipLengthBeats,
  );
}

export function playheadStyle(
  relativeBeat: number | null,
  clipLengthBeats: number,
): CSSProperties | undefined {
  if (relativeBeat === null) {
    return undefined;
  }
  const safeLength = Math.max(0.125, clipLengthBeats);
  return {left: `${Math.max(0, Math.min(100, (relativeBeat / safeLength) * 100))}%`};
}
