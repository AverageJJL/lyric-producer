import {BEATS_PER_BAR, BEATS_PER_STEP} from './drumPatterns';
import type {DAWNote} from '../store/useDAWStore';
import {clipDisplayPixelsPerBeat} from '../ui/clipDisplayScale';

const MIN_PITCH_SPAN = 12;
const PITCH_PADDING = 2;
const PREVIEW_PADDING_PX = 2;
const LABEL_SAFE_TOP_PX = 20;
const LABEL_SAFE_MIN_HEIGHT_PX = 44;
const NOTE_STROKE_HEIGHT_PX = 3;
const MIN_NOTE_STROKE_HEIGHT_PX = 2;
const MAX_NOTE_STROKE_HEIGHT_PX = 4;

export type MidiPreviewNoteLayout = {
  key: string;
  left: number;
  top: number;
  width: number;
  height: number;
  opacity: number;
};

export type MidiPreviewGridLine = {
  key: string;
  left: number;
  isBar: boolean;
};

export type MidiPreviewLayout = {
  minNote: number;
  maxNote: number;
  notes: MidiPreviewNoteLayout[];
  gridLines: MidiPreviewGridLine[];
  isEmpty: boolean;
};

function adaptivePitchRange(notes: DAWNote[]): {minNote: number; maxNote: number} {
  if (notes.length === 0) {
    return {minNote: 48, maxNote: 72};
  }

  let minNote = notes[0]!.note;
  let maxNote = notes[0]!.note;
  for (const note of notes) {
    minNote = Math.min(minNote, note.note);
    maxNote = Math.max(maxNote, note.note);
  }

  minNote = Math.max(0, minNote - PITCH_PADDING);
  maxNote = Math.min(127, maxNote + PITCH_PADDING);
  if (maxNote - minNote < MIN_PITCH_SPAN) {
    const center = Math.round((minNote + maxNote) / 2);
    minNote = Math.max(0, center - MIN_PITCH_SPAN / 2);
    maxNote = Math.min(127, minNote + MIN_PITCH_SPAN);
    minNote = Math.max(0, maxNote - MIN_PITCH_SPAN);
  }

  return {minNote, maxNote};
}

function velocityOpacity(velocity: number): number {
  const normalized = Math.min(127, Math.max(1, velocity)) / 127;
  return 0.45 + normalized * 0.55;
}

function previewNoteHeight(heightPx: number): number {
  const available = Math.max(MIN_NOTE_STROKE_HEIGHT_PX, heightPx - PREVIEW_PADDING_PX * 2);
  return Math.min(
    MAX_NOTE_STROKE_HEIGHT_PX,
    Math.max(MIN_NOTE_STROKE_HEIGHT_PX, Math.min(NOTE_STROKE_HEIGHT_PX, available)),
  );
}

function previewTopPadding(heightPx: number, noteHeight: number): number {
  const preferredTop = heightPx >= LABEL_SAFE_MIN_HEIGHT_PX ? LABEL_SAFE_TOP_PX : PREVIEW_PADDING_PX;
  const maxTop = Math.max(PREVIEW_PADDING_PX, heightPx - noteHeight - PREVIEW_PADDING_PX);
  return Math.min(preferredTop, maxTop);
}

export function buildMidiPreviewGridLines(
  lengthBeats: number,
  widthPx: number,
  pixelsPerBeat?: number,
): MidiPreviewGridLine[] {
  const beatWidth = pixelsPerBeat ?? clipDisplayPixelsPerBeat(widthPx, lengthBeats);
  const lines: MidiPreviewGridLine[] = [];
  const maxBeat = Math.ceil(lengthBeats / BEATS_PER_STEP) * BEATS_PER_STEP;

  for (let beat = 0; beat <= maxBeat + 1e-6; beat += BEATS_PER_STEP) {
    if (beat > lengthBeats + 1e-6) {
      break;
    }
    const isBar = Math.abs(beat % BEATS_PER_BAR) < 1e-6;
    lines.push({
      key: `grid-${beat}`,
      left: beat * beatWidth,
      isBar,
    });
  }

  return lines;
}

export function notesToPreviewLayout(
  notes: DAWNote[],
  lengthBeats: number,
  widthPx: number,
  heightPx: number,
  pixelsPerBeat?: number,
): MidiPreviewLayout {
  const beatWidth = pixelsPerBeat ?? clipDisplayPixelsPerBeat(widthPx, lengthBeats);
  const {minNote, maxNote} = adaptivePitchRange(notes);
  const pitchSpan = Math.max(1, maxNote - minNote);
  const noteHeight = previewNoteHeight(heightPx);
  const topPadding = previewTopPadding(heightPx, noteHeight);
  const bottomPadding = PREVIEW_PADDING_PX;
  const pitchTravelHeight = Math.max(0, heightPx - topPadding - bottomPadding - noteHeight);

  const noteLayouts = notes.map((note, index) => {
    const noteStart = Math.max(0, note.startBeat);
    const noteEnd = note.startBeat + note.lengthBeats;
    if (noteEnd <= 1e-6 || noteStart >= lengthBeats - 1e-6) {
      return null;
    }

    const visibleEnd = Math.min(lengthBeats, noteEnd);
    const visibleLength = visibleEnd - noteStart;
    if (visibleLength <= 1e-6) {
      return null;
    }

    const pitchRatio = (maxNote - note.note) / pitchSpan;
    return {
      key: `${index}-${note.note}-${note.startBeat}-${note.lengthBeats}-${note.velocity}`,
      left: noteStart * beatWidth,
      top: topPadding + pitchRatio * pitchTravelHeight,
      width: Math.max(2, visibleLength * beatWidth),
      height: noteHeight,
      opacity: velocityOpacity(note.velocity),
    };
  }).filter((layout): layout is MidiPreviewNoteLayout => layout !== null);

  return {
    minNote,
    maxNote,
    notes: noteLayouts,
    gridLines: buildMidiPreviewGridLines(lengthBeats, widthPx, beatWidth),
    isEmpty: notes.length === 0,
  };
}
