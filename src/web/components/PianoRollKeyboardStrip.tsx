import React from 'react';

import {midiNoteLabel} from '../../music/noteUtils';
import {
  PIANO_ROLL_NOTES,
  PIANO_ROLL_LANE_COUNT,
  pianoRollEditorSurfaceHeight,
  pianoRollKeyColor,
  pianoRollKeyStyle,
  pianoRollKeyboardSeamStyles,
} from './pianoRollGeometry';

type PianoRollKeyboardStripProps = {
  activeNotes: Set<number>;
  surfaceHeight: number;
  onAuditionStart: (note: number) => void;
  onAuditionEnd: (note: number) => void;
};

function KeyButton({
  note,
  activeNotes,
  onAuditionStart,
  onAuditionEnd,
}: {
  note: number;
  activeNotes: Set<number>;
  onAuditionStart: (note: number) => void;
  onAuditionEnd: (note: number) => void;
}) {
  const label = midiNoteLabel(note);
  const keyColor = pianoRollKeyColor(note);
  return (
    <button
      type="button"
      aria-label={label}
      className={`piano-roll-key ${keyColor} ${activeNotes.has(note) ? 'active' : ''}`}
      style={pianoRollKeyStyle(note)}
      onPointerDown={() => onAuditionStart(note)}
      onPointerUp={() => onAuditionEnd(note)}
      onPointerCancel={() => onAuditionEnd(note)}
      onPointerLeave={event => event.buttons === 1 && onAuditionEnd(note)}>
      <span>{keyColor === 'white' ? label : ''}</span>
    </button>
  );
}

export function PianoRollKeyboardStrip({
  activeNotes,
  surfaceHeight,
  onAuditionStart,
  onAuditionEnd,
}: PianoRollKeyboardStripProps) {
  const stripHeight = pianoRollEditorSurfaceHeight(surfaceHeight);
  const seams = pianoRollKeyboardSeamStyles();
  return (
    <div
      className="piano-roll-key-strip"
      aria-label="Piano keyboard"
      style={{height: `max(100%, ${stripHeight}px)`}}>
      <div className="piano-roll-key-ruler-spacer" />
      <div
        className="piano-roll-key-stack"
        style={{
          '--piano-roll-lanes': PIANO_ROLL_LANE_COUNT,
          height: `${surfaceHeight}px`,
        } as React.CSSProperties}>
        <div className="piano-roll-white-seams" aria-hidden="true">
          {seams.map(seam => (
            <span key={seam.key} className="piano-roll-white-seam" style={{top: seam.top}} />
          ))}
        </div>
        {PIANO_ROLL_NOTES.map(note => (
          <KeyButton
            key={note}
            note={note}
            activeNotes={activeNotes}
            onAuditionStart={onAuditionStart}
            onAuditionEnd={onAuditionEnd}
          />
        ))}
      </div>
    </div>
  );
}
