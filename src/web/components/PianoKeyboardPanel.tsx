import React, {useMemo, useState} from 'react';

import {useKeyboardPreview} from '../../hooks/useKeyboardPreview';
import {midiNoteLabel} from '../../music/noteUtils';
import {getTrackInstrumentLabel, isSoftwareInstrumentTrack, type DAWTrack} from '../../store/useDAWStore';
import {
  BLACK_KEY_SEMITONES,
  BLACK_KEY_HEIGHT,
  BLACK_KEY_WIDTH,
  OCTAVE_WHITE_NOTES,
  WHITE_KEY_HEIGHT,
  WHITE_KEY_WIDTH,
  blackKeyLeftInOctave,
  octaveContainerWidth,
} from '../../ui/pianoLayout';

type PianoKeyboardPanelProps = {
  track: DAWTrack;
};

function PianoKey({
  note,
  isBlack,
  isActive,
  label,
  onPressIn,
  onPressOut,
}: {
  note: number;
  isBlack: boolean;
  isActive: boolean;
  label?: string;
  onPressIn: (note: number) => void;
  onPressOut: (note: number) => void;
}) {
  return (
    <button
      type="button"
      className={`${isBlack ? 'black-key' : 'white-key'} ${isActive ? 'active' : ''}`}
      style={{
        width: isBlack ? BLACK_KEY_WIDTH : WHITE_KEY_WIDTH,
        height: isBlack ? BLACK_KEY_HEIGHT : WHITE_KEY_HEIGHT,
      }}
      onPointerDown={() => onPressIn(note)}
      onPointerUp={() => onPressOut(note)}
      onPointerCancel={() => onPressOut(note)}
      onPointerLeave={event => event.buttons === 1 && onPressOut(note)}>
      {!isBlack && label ? <span>{label}</span> : null}
    </button>
  );
}

function PianoOctave({
  octave,
  activeNotes,
  onPressIn,
  onPressOut,
}: {
  octave: number;
  activeNotes: Set<number>;
  onPressIn: (note: number) => void;
  onPressOut: (note: number) => void;
}) {
  const baseNote = octave * 12;
  return (
    <div className="piano-octave" style={{width: octaveContainerWidth()}}>
      <div className="white-key-row">
        {OCTAVE_WHITE_NOTES.map(semitone => {
          const note = baseNote + semitone;
          return (
            <PianoKey
              key={`w-${note}`}
              note={note}
              isBlack={false}
              isActive={activeNotes.has(note)}
              label={midiNoteLabel(note)}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
            />
          );
        })}
      </div>
      {BLACK_KEY_SEMITONES.map(semitone => {
        const note = baseNote + semitone;
        return (
          <div key={`b-${note}`} className="black-key-wrap" style={{left: blackKeyLeftInOctave(semitone)}}>
            <PianoKey
              note={note}
              isBlack
              isActive={activeNotes.has(note)}
              onPressIn={onPressIn}
              onPressOut={onPressOut}
            />
          </div>
        );
      })}
    </div>
  );
}

export function PianoKeyboardPanel({track}: PianoKeyboardPanelProps) {
  const [startOctave, setStartOctave] = useState(3);
  const [activeNotes, setActiveNotes] = useState<Set<number>>(new Set());
  const {previewNoteOn, previewNoteOff, panicAllNotesOff} = useKeyboardPreview();
  const octaves = useMemo(() => [startOctave, startOctave + 1], [startOctave]);

  if (!isSoftwareInstrumentTrack(track)) {
    return null;
  }

  const handlePressIn = (note: number) => {
    setActiveNotes(prev => new Set(prev).add(note));
    previewNoteOn({trackId: track.id, note, velocity: 100});
  };
  const handlePressOut = (note: number) => {
    setActiveNotes(prev => {
      const next = new Set(prev);
      next.delete(note);
      return next;
    });
    previewNoteOff({trackId: track.id, note});
  };

  return (
    <section className="editor-panel">
      <div className="editor-header">
        <div>
          <h2>Keyboard</h2>
          <p>{track.name} · {getTrackInstrumentLabel(track)}</p>
        </div>
        <div className="editor-actions">
          <button type="button" onClick={() => setStartOctave(octave => Math.max(1, octave - 1))}>Oct -</button>
          <button type="button" onClick={() => setStartOctave(octave => Math.min(6, octave + 1))}>Oct +</button>
          <button type="button" onClick={() => panicAllNotesOff(track.id)}>Panic</button>
        </div>
      </div>
      <div className="keyboard-scroll">
        {octaves.map(octave => (
          <PianoOctave key={`oct-${octave}`} octave={octave} activeNotes={activeNotes} onPressIn={handlePressIn} onPressOut={handlePressOut} />
        ))}
      </div>
    </section>
  );
}
