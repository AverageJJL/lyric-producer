import React from 'react';

import {midiNoteLabel} from '../../music/noteUtils';
import type {DAWNote} from '../../store/useDAWStore';

type SortedNote = {note: DAWNote; index: number};

type PianoRollInspectorProps = {
  notes: SortedNote[];
  selectedIndexes: Set<number>;
  selectedNote: DAWNote | null;
  onSelectNote: (index: number, mode: 'replace' | 'toggle') => void;
  onCommitNote: (updates: Partial<DAWNote>) => void;
};

export function PianoRollInspector({
  notes,
  selectedIndexes,
  selectedNote,
  onSelectNote,
  onCommitNote,
}: PianoRollInspectorProps) {
  return (
    <div className="piano-roll-inspector">
      <div className="piano-roll-fields">
        <label>Note<input aria-label="Note" type="number" value={selectedNote?.note ?? 60} min={0} max={127} disabled={!selectedNote} onChange={event => onCommitNote({note: Number(event.target.value)})} /></label>
        <label>Start<input aria-label="Start" type="number" value={selectedNote?.startBeat ?? 0} min={0} step={0.25} disabled={!selectedNote} onChange={event => onCommitNote({startBeat: Number(event.target.value)})} /></label>
        <label>Length<input aria-label="Length" type="number" value={selectedNote?.lengthBeats ?? 0.5} min={0.125} step={0.125} disabled={!selectedNote} onChange={event => onCommitNote({lengthBeats: Number(event.target.value)})} /></label>
        <label>Velocity<input aria-label="Velocity" type="number" value={selectedNote?.velocity ?? 100} min={1} max={127} disabled={!selectedNote} onChange={event => onCommitNote({velocity: Number(event.target.value)})} /></label>
      </div>
      <div className="piano-roll-list" role="listbox" aria-label="Note list">
        {notes.map(({note, index}) => (
          <button
            key={`${index}-${note.note}-${note.startBeat}`}
            type="button"
            className={selectedIndexes.has(index) ? 'active' : ''}
            onClick={event => onSelectNote(index, event.shiftKey || event.metaKey || event.ctrlKey ? 'toggle' : 'replace')}>
            <span>{midiNoteLabel(note.note)}</span>
            <span>{note.startBeat.toFixed(2)}</span>
            <span>{note.velocity}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
