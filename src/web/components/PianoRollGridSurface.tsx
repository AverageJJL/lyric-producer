import React, {useEffect, useRef, useState} from 'react';

import {
  movePianoRollNotes,
  resizePianoRollNotes,
} from '../../arrangement/midiNoteEditCommands';
import {quantizeBeat, midiNoteLabel} from '../../music/noteUtils';
import type {TimeSignature} from '../../store/projectMetadata';
import type {DAWNote} from '../../store/useDAWStore';
import type {MeterMapEvent} from '../../transport/tempoMap';
import {
  beatFromGridX,
  buildPianoRollGridModel,
  draftPianoRollNote,
  noteFromGridY,
  PIANO_ROLL_LANE_COUNT,
  pianoRollEditorSurfaceHeight,
  pianoRollNoteStyle,
  playheadStyle,
} from './pianoRollGeometry';
import {
  noteDeltaFromGridY,
  pianoRollMarqueeIndexes,
  pianoRollMarqueeStyle,
  type PianoRollMarqueeSession,
} from './pianoRollSelectionGeometry';
import {PianoRollNoteVelocityBar} from './PianoRollNoteVelocityBar';

type SelectionMode = 'replace' | 'toggle';
type ResizeEdge = 'start' | 'end';

type PianoRollGridSurfaceProps = {
  notes: DAWNote[];
  selectedIndexes: Set<number>;
  activeIndex: number | null;
  clipStartBeat: number;
  clipLengthBeats: number;
  timeSignature: TimeSignature;
  meterMap: MeterMapEvent[];
  surfaceHeight: number;
  surfaceWidth: number;
  playheadRelativeBeat: number | null;
  rememberedNoteLengthBeats: number;
  onCreateNote: (note: DAWNote) => void;
  onSelectNote: (index: number, mode: SelectionMode) => void;
  onSelectIndexes: (indexes: number[], additive: boolean) => void;
  onClearSelection: () => void;
  onPreviewStart: (note: DAWNote) => void;
  onPreviewEnd: (note: DAWNote) => void;
  onMoveNotes: (indexes: number[], beatDelta: number, noteDelta: number) => void;
  onResizeNotes: (indexes: number[], edge: ResizeEdge, beatDelta: number) => void;
};

type NoteDragSession = {
  pointerId: number;
  mode: 'move' | ResizeEdge;
  indexes: number[];
  originX: number;
  originY: number;
  gridWidth: number;
  gridHeight: number;
  previewNote: DAWNote;
};

type CreateSession = {
  pointerId: number;
  originX: number;
  originBeat: number;
  originNoteNumber: number;
  gridWidth: number;
  previewNote: DAWNote;
};

function noteKey(note: DAWNote, index: number): string {
  return `${index}-${note.note}-${note.startBeat}-${note.lengthBeats}-${note.velocity}`;
}

export function PianoRollGridSurface({
  notes,
  selectedIndexes,
  activeIndex,
  clipStartBeat,
  clipLengthBeats,
  timeSignature,
  meterMap,
  surfaceHeight,
  surfaceWidth,
  playheadRelativeBeat,
  rememberedNoteLengthBeats,
  onCreateNote,
  onSelectNote,
  onSelectIndexes,
  onClearSelection,
  onPreviewStart,
  onPreviewEnd,
  onMoveNotes,
  onResizeNotes,
}: PianoRollGridSurfaceProps) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<NoteDragSession | null>(null);
  const createRef = useRef<CreateSession | null>(null);
  const marqueeRef = useRef<PianoRollMarqueeSession | null>(null);
  const [isPenMode, setIsPenMode] = useState(false);
  const [draftNotes, setDraftNotes] = useState<DAWNote[] | null>(null);
  const [draftCreate, setDraftCreate] = useState<DAWNote | null>(null);
  const [marquee, setMarquee] = useState<React.CSSProperties | null>(null);

  useEffect(() => {
    const down = (event: KeyboardEvent) =>
      setIsPenMode(event.metaKey || event.ctrlKey || event.key === 'Meta' || event.key === 'Control');
    const up = (event: KeyboardEvent) => setIsPenMode(event.metaKey || event.ctrlKey);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); };
  }, []);

  const startGridPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('.piano-roll-note')) {
      return;
    }
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (event.metaKey || event.ctrlKey) {
      const previewNote = draftPianoRollNote(
        beatFromGridX(x, rect.width, clipLengthBeats),
        noteFromGridY(y, rect.height),
        rememberedNoteLengthBeats,
        0,
        rect.width,
        clipLengthBeats,
      );
      createRef.current = {
        pointerId: event.pointerId,
        originX: event.clientX,
        originBeat: previewNote.startBeat,
        originNoteNumber: previewNote.note,
        gridWidth: rect.width,
        previewNote,
      };
      setDraftCreate(previewNote);
      onPreviewStart(previewNote);
      return;
    }
    marqueeRef.current = {pointerId: event.pointerId, originX: x, originY: y, additive: event.shiftKey, gridWidth: rect.width, gridHeight: rect.height};
    setMarquee(pianoRollMarqueeStyle(marqueeRef.current, x, y));
  };

  const moveGridPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    setIsPenMode(event.metaKey || event.ctrlKey);
    const create = createRef.current;
    const mark = marqueeRef.current;
    if (create?.pointerId === event.pointerId) {
      event.preventDefault();
      setDraftCreate(draftPianoRollNote(create.originBeat, create.originNoteNumber, rememberedNoteLengthBeats, event.clientX - create.originX, create.gridWidth, clipLengthBeats));
    } else if (mark?.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      setMarquee(pianoRollMarqueeStyle(mark, event.clientX - rect.left, event.clientY - rect.top));
    }
  };

  const endGridPointer = (event: React.PointerEvent<HTMLDivElement>, commit = true) => {
    const create = createRef.current;
    const mark = marqueeRef.current;
    if (create?.pointerId === event.pointerId) {
      if (commit) {
        onCreateNote(draftPianoRollNote(create.originBeat, create.originNoteNumber, rememberedNoteLengthBeats, event.clientX - create.originX, create.gridWidth, clipLengthBeats));
      }
      onPreviewEnd(create.previewNote);
      createRef.current = null;
      setDraftCreate(null);
    } else if (mark?.pointerId === event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (Math.abs(x - mark.originX) < 4 && Math.abs(y - mark.originY) < 4 && !mark.additive) {
        onClearSelection();
      } else {
        onSelectIndexes(pianoRollMarqueeIndexes(notes, mark, x, y, clipLengthBeats), mark.additive);
      }
      marqueeRef.current = null;
      setMarquee(null);
    }
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const startNotePointer = (event: React.PointerEvent<HTMLButtonElement>, index: number, note: DAWNote) => {
    event.stopPropagation();
    setIsPenMode(event.metaKey || event.ctrlKey);
    const edge = (event.target as HTMLElement).dataset.resizeEdge as ResizeEdge | undefined;
    const additive = event.shiftKey || event.metaKey || event.ctrlKey;
    if (additive) {
      onSelectNote(index, 'toggle');
      return;
    }
    const wasSelected = selectedIndexes.has(index);
    const indexes = wasSelected ? [...selectedIndexes] : [index];
    if (!wasSelected) {
      onSelectNote(index, 'replace');
    }
    const gridRect = gridRef.current?.getBoundingClientRect();
    dragRef.current = {pointerId: event.pointerId, mode: edge ?? 'move', indexes, originX: event.clientX, originY: event.clientY, gridWidth: gridRect?.width ?? 1, gridHeight: gridRect?.height ?? 1, previewNote: note};
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onPreviewStart(note);
  };

  const previewDrag = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return null;
    }
    const beatDelta = quantizeBeat(((event.clientX - session.originX) / session.gridWidth) * clipLengthBeats);
    if (session.mode === 'move') {
      return movePianoRollNotes(notes, session.indexes, beatDelta, noteDeltaFromGridY(event.clientY - session.originY, session.gridHeight), clipLengthBeats);
    }
    return resizePianoRollNotes(notes, session.indexes, session.mode, beatDelta, clipLengthBeats);
  };

  const moveNotePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const next = previewDrag(event);
    if (!next) {
      return;
    }
    event.preventDefault();
    setDraftNotes(next);
  };

  const endNotePointer = (event: React.PointerEvent<HTMLButtonElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const beatDelta = quantizeBeat(((event.clientX - session.originX) / session.gridWidth) * clipLengthBeats);
    if (session.mode === 'move') {
      onMoveNotes(session.indexes, beatDelta, noteDeltaFromGridY(event.clientY - session.originY, session.gridHeight));
    } else {
      onResizeNotes(session.indexes, session.mode, beatDelta);
    }
    onPreviewEnd(session.previewNote);
    dragRef.current = null;
    setDraftNotes(null);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  };

  const displayNotes = draftNotes ?? notes;
  const renderedNotes = draftCreate ? [...displayNotes, draftCreate] : displayNotes;
  const gridModel = buildPianoRollGridModel({clipStartBeat, clipLengthBeats, timeSignature, meterMap});
  const surfaceStyle = {height: `max(100%, ${pianoRollEditorSurfaceHeight(surfaceHeight)}px)`, width: `max(100%, ${surfaceWidth}px)`};

  return (
    <div className="piano-roll-grid-wrap" style={surfaceStyle}>
      <div className="piano-roll-grid-ruler" aria-hidden="true">
        {gridModel.rulerTicks.map(tick => <span key={tick.key} style={{left: tick.left}}>{tick.label}</span>)}
      </div>
      <div
        ref={gridRef}
        className={`piano-roll-grid ${isPenMode ? 'pen-mode' : ''}`}
        aria-label="MIDI notes"
        style={{
          '--piano-roll-lanes': PIANO_ROLL_LANE_COUNT,
          height: `${surfaceHeight}px`,
        } as React.CSSProperties}
        onPointerDown={startGridPointer}
        onPointerEnter={event => setIsPenMode(event.metaKey || event.ctrlKey)}
        onPointerMove={moveGridPointer}
        onPointerUp={endGridPointer}
        onPointerCancel={event => endGridPointer(event, false)}>
        <div className="piano-roll-grid-lines" aria-hidden="true">
          {gridModel.gridLines.map(line => <span key={line.key} className={`piano-roll-grid-line ${line.kind}`} style={{left: line.left}} />)}
        </div>
        {notes.length === 0 ? <span className="editor-empty">No notes</span> : null}
        {playheadRelativeBeat !== null ? <span className="piano-roll-playhead" style={playheadStyle(playheadRelativeBeat, clipLengthBeats)} /> : null}
        {marquee ? <span className="piano-roll-marquee" style={marquee} /> : null}
        {renderedNotes.map((note, index) => (
          <button
            key={noteKey(notes[index] ?? note, index)}
            type="button"
            className={`piano-roll-note ${selectedIndexes.has(index) ? 'selected' : ''} ${activeIndex === index ? 'active' : ''} ${draftNotes ? 'dragging' : ''} ${draftCreate && index === renderedNotes.length - 1 ? 'draft' : ''}`}
            style={pianoRollNoteStyle(note, clipLengthBeats)}
            onPointerDown={event => startNotePointer(event, index, note)}
            onPointerMove={moveNotePointer}
            onPointerUp={endNotePointer}
            onPointerCancel={endNotePointer}>
            <span className="piano-roll-note-resize start" data-resize-edge="start" />
            <PianoRollNoteVelocityBar note={note} />
            <span className="piano-roll-note-label">{midiNoteLabel(note.note)}</span>
            <span className="piano-roll-note-resize end" data-resize-edge="end" />
          </button>
        ))}
      </div>
    </div>
  );
}
