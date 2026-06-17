import React from 'react';

import {clampVelocity} from '../../music/noteUtils';
import type {DAWNote} from '../../store/useDAWStore';

type PianoRollNoteVelocityBarProps = {
  note: DAWNote;
};

function velocityPercent(velocity: number): string {
  return `${Math.max(8, (clampVelocity(velocity) / 127) * 100)}%`;
}

export function PianoRollNoteVelocityBar({note}: PianoRollNoteVelocityBarProps) {
  return (
    <span
      className="piano-roll-note-velocity"
      aria-hidden="true"
      style={{'--note-velocity-width': velocityPercent(note.velocity)} as React.CSSProperties}>
      <span className="piano-roll-note-velocity-fill" />
    </span>
  );
}
