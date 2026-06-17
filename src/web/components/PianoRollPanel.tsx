import React, {useMemo, useRef, useState} from 'react';

import {
  legatoSelectedPianoRollNotes,
  movePianoRollNotes,
  quantizeSelectedPianoRollNotes,
  resizePianoRollNotes,
  sanitizePianoRollNote,
  transposeSelectedPianoRollNotes,
  type PianoRollNoteClipboard,
} from '../../arrangement/midiNoteEditCommands';
import {useKeyboardPreview} from '../../hooks/useKeyboardPreview';
import {useVisualPlaybackBeat} from '../../hooks/useVisualPlaybackBeat';
import {DEFAULT_NOTE_LENGTH_BEATS} from '../../music/noteUtils';
import {beatsPerBarForTimeSignature} from '../../store/projectMetadata';
import {
  getTrackInstrumentLabel,
  isSoftwareInstrumentTrack,
  type DAWNote,
  type DAWTrack,
  useDAWStore,
} from '../../store/useDAWStore';
import {PianoRollGridSurface} from './PianoRollGridSurface';
import {PianoRollHeaderActions} from './PianoRollHeaderActions';
import {PianoRollInspector} from './PianoRollInspector';
import {PianoRollKeyboardStrip} from './PianoRollKeyboardStrip';
import {
  clampPianoRollLaneHeight,
  clampPianoRollPixelsPerBeat,
  DEFAULT_PIANO_ROLL_LANE_HEIGHT,
  DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT,
  pianoRollSurfaceHeight,
  pianoRollSurfaceWidth,
} from './pianoRollGeometry';
import {handlePianoRollShortcut} from './pianoRollShortcuts';
import {usePianoRollSelectionState} from './usePianoRollSelectionState';

type PianoRollPanelProps = {
  blockId: string | null;
  track: DAWTrack;
};

function isTextEditingTarget(target: EventTarget): boolean {
  return target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

export function PianoRollPanel({blockId, track}: PianoRollPanelProps) {
  const block = useDAWStore(state => state.blocks.find(item => item.id === blockId) ?? null);
  const playheadBeat = useDAWStore(state => state.playheadBeat);
  const timeSignature = useDAWStore(state => state.timeSignature);
  const meterMap = useDAWStore(state => state.meterMap);
  const addNoteToBlock = useDAWStore(state => state.addNoteToBlock);
  const updateNoteInBlock = useDAWStore(state => state.updateNoteInBlock);
  const replaceBlockNotes = useDAWStore(state => state.replaceBlockNotes);
  const createMidiClipAtBeat = useDAWStore(state => state.createMidiClipAtBeat);
  const [noteClipboard, setNoteClipboard] = useState<PianoRollNoteClipboard | null>(null);
  const [activePreviewNotes, setActivePreviewNotes] = useState<Set<number>>(new Set());
  const [rememberedNoteLengthBeats, setRememberedNoteLengthBeats] = useState(DEFAULT_NOTE_LENGTH_BEATS);
  const [pixelsPerBeat, setPixelsPerBeat] = useState(DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT);
  const [laneHeight, setLaneHeight] = useState(DEFAULT_PIANO_ROLL_LANE_HEIGHT);
  const panelRef = useRef<HTMLElement>(null);
  const {previewNoteOn, previewNoteOff} = useKeyboardPreview();

  const beatsPerBar = beatsPerBarForTimeSignature(timeSignature);
  const previewStartBeat = Math.floor(Math.max(0, playheadBeat) / beatsPerBar) * beatsPerBar;
  const notes = block?.type === 'midi' ? block.notes ?? [] : [];
  const clipStartBeat = block?.type === 'midi' ? block.startBeat : previewStartBeat;
  const clipLengthBeats = Math.max(0.125, block?.type === 'midi' ? block.lengthBeats : beatsPerBar * 4);
  const surfaceHeight = pianoRollSurfaceHeight(laneHeight);
  const surfaceWidth = pianoRollSurfaceWidth(clipLengthBeats, pixelsPerBeat);
  const visualBeat = useVisualPlaybackBeat(
    Math.max(clipStartBeat + clipLengthBeats, playheadBeat + clipLengthBeats),
  );
  const playheadRelativeBeat =
    visualBeat >= clipStartBeat && visualBeat <= clipStartBeat + clipLengthBeats
      ? visualBeat - clipStartBeat
      : null;
  const {
    activeNoteIndex,
    selectedNoteIndexes,
    selectedIndexesArray,
    selectNote,
    selectIndexes,
    clearSelection,
    selectOnly,
  } = usePianoRollSelectionState(block?.id, notes.length);
  const selectedNote = activeNoteIndex === null ? null : notes[activeNoteIndex] ?? null;

  const sortedNoteIndexes = useMemo(
    () =>
      notes
        .map((note, index) => ({note, index}))
        .sort((a, b) => a.note.startBeat - b.note.startBeat || a.note.note - b.note.note),
    [notes],
  );

  if (!isSoftwareInstrumentTrack(track)) {
    return null;
  }

  const resolveEditableBlockId = (absoluteBeat: number): string | null => {
    if (block?.type === 'midi') {
      return block.id;
    }
    return createMidiClipAtBeat(track.id, absoluteBeat, clipLengthBeats);
  };

  const commitSelectedNote = (updates: Partial<DAWNote>) => {
    if (!selectedNote || !block?.id || activeNoteIndex === null) {
      return;
    }
    const nextNote = sanitizePianoRollNote({...selectedNote, ...updates}, clipLengthBeats);
    updateNoteInBlock(block.id, activeNoteIndex, nextNote);
    if (typeof updates.lengthBeats === 'number') {
      setRememberedNoteLengthBeats(nextNote.lengthBeats);
    }
  };

  const addNote = (absoluteBeat: number, note: DAWNote) => {
    const targetBlockId = resolveEditableBlockId(absoluteBeat);
    if (!targetBlockId) {
      return;
    }
    const targetBlock = useDAWStore.getState().blocks.find(item => item.id === targetBlockId);
    const existingLength = targetBlock?.notes?.length ?? 0;
    addNoteToBlock(targetBlockId, note);
    selectOnly([existingLength]);
  };

  const handleCreateNote = (note: DAWNote) => {
    addNote(clipStartBeat + note.startBeat, note);
    setRememberedNoteLengthBeats(note.lengthBeats);
  };

  const replaceNotes = (nextNotes: DAWNote[], nextSelection?: number[]) => {
    if (!block?.id) {
      return;
    }
    replaceBlockNotes(block.id, nextNotes);
    if (nextSelection) {
      selectOnly(nextSelection);
    }
  };

  const handleMoveNotes = (indexes: number[], beatDelta: number, noteDelta: number) => {
    replaceNotes(movePianoRollNotes(notes, indexes, beatDelta, noteDelta, clipLengthBeats), indexes);
  };

  const handleResizeNotes = (indexes: number[], edge: 'start' | 'end', beatDelta: number) => {
    replaceNotes(resizePianoRollNotes(notes, indexes, edge, beatDelta, clipLengthBeats), indexes);
  };

  const previewStart = (note: number, velocity = 100) => {
    setActivePreviewNotes(prev => new Set(prev).add(note));
    previewNoteOn({trackId: track.id, note, velocity});
  };

  const previewEnd = (note: number) => {
    setActivePreviewNotes(prev => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    previewNoteOff({trackId: track.id, note});
  };

  const focusPanelFromPointer = (event: React.PointerEvent<HTMLElement>) => {
    if (!isTextEditingTarget(event.target)) {
      panelRef.current?.focus({preventScroll: true});
    }
  };

  const handleShortcut = (event: React.KeyboardEvent<HTMLElement>) => {
    if (isTextEditingTarget(event.target)) {
      return;
    }
    handlePianoRollShortcut(event, {
      notes,
      selectedIndexes: selectedIndexesArray(),
      hasActiveNote: Boolean(selectedNote),
      noteClipboard,
      clipLengthBeats,
      playheadRelativeBeat,
      setNoteClipboard,
      replaceNotes,
      selectIndexes,
    });
  };

  return (
    <section
      ref={panelRef}
      className="editor-panel piano-roll-panel"
      aria-label="Piano roll"
      tabIndex={0}
      onPointerDownCapture={focusPanelFromPointer}
      onKeyDown={handleShortcut}>
      <div className="editor-header piano-roll-header">
        <div>
          <h2>Piano Roll</h2>
          <p>{block?.name ?? 'MIDI'} · {track.name} · {getTrackInstrumentLabel(track)}</p>
        </div>
        <PianoRollHeaderActions
            laneHeight={laneHeight}
            pixelsPerBeat={pixelsPerBeat}
            hasBlock={Boolean(block)}
            onLaneHeightChange={value => setLaneHeight(clampPianoRollLaneHeight(value))}
            onPixelsPerBeatChange={value => setPixelsPerBeat(clampPianoRollPixelsPerBeat(value))}
            onQuantize={() => replaceNotes(quantizeSelectedPianoRollNotes(notes, selectedIndexesArray(), clipLengthBeats), selectedIndexesArray())}
            onTranspose={semitones => replaceNotes(transposeSelectedPianoRollNotes(notes, selectedIndexesArray(), semitones), selectedIndexesArray())}
            onLegato={() => replaceNotes(legatoSelectedPianoRollNotes(notes, selectedIndexesArray(), clipLengthBeats), selectedIndexesArray())}
          />
      </div>
      <div className="piano-roll-body">
        <PianoRollInspector
          notes={sortedNoteIndexes}
          selectedIndexes={selectedNoteIndexes}
          selectedNote={selectedNote}
          onSelectNote={selectNote}
          onCommitNote={commitSelectedNote}
        />
        <div className="piano-roll-main-scroll">
          <PianoRollKeyboardStrip
            activeNotes={activePreviewNotes}
            surfaceHeight={surfaceHeight}
            onAuditionStart={previewStart}
            onAuditionEnd={previewEnd}
          />
          <PianoRollGridSurface
            notes={notes}
            selectedIndexes={selectedNoteIndexes}
            activeIndex={activeNoteIndex}
            clipStartBeat={clipStartBeat}
            clipLengthBeats={clipLengthBeats}
            timeSignature={timeSignature}
            meterMap={meterMap}
            surfaceHeight={surfaceHeight}
            surfaceWidth={surfaceWidth}
            playheadRelativeBeat={playheadRelativeBeat}
            rememberedNoteLengthBeats={rememberedNoteLengthBeats}
            onCreateNote={handleCreateNote}
            onSelectNote={selectNote}
            onSelectIndexes={selectIndexes}
            onClearSelection={clearSelection}
            onPreviewStart={note => previewStart(note.note, note.velocity)}
            onPreviewEnd={note => previewEnd(note.note)}
            onMoveNotes={handleMoveNotes}
            onResizeNotes={handleResizeNotes}
          />
        </div>
      </div>
    </section>
  );
}
