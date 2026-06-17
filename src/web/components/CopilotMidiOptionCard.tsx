import React, {useMemo} from 'react';

import {encodeCopilotMidiOptionDrag, COPILOT_MIDI_OPTION_DRAG_TYPE} from '../../assistant/copilotMidiOptionDrag';
import type {CopilotMidiOption} from '../../assistant/copilotMidiOptions';
import {midiNoteLabel} from '../../music/noteUtils';
import {notesToPreviewLayout} from '../../music/midiClipPreviewLayout';
import {ImportArrowIcon, PlayTriangleIcon, StopSquareIcon} from './icons/WorkspaceIcons';

type CopilotMidiOptionCardProps = {
  option: CopilotMidiOption;
  isPlaying: boolean;
  status?: string;
  error?: string;
  onPlay: (option: CopilotMidiOption) => void;
  onStop: () => void;
  onImport: (option: CopilotMidiOption) => void;
};

const PREVIEW_WIDTH = 240;
const PREVIEW_HEIGHT = 70;

function noteRangeLabel(option: CopilotMidiOption): string {
  const notes = option.notes.map(note => note.note);
  const min = Math.min(...notes);
  const max = Math.max(...notes);
  return min === max ? midiNoteLabel(min) : `${midiNoteLabel(min)}-${midiNoteLabel(max)}`;
}

function roleLabel(role: CopilotMidiOption['role']): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function CopilotMidiOptionCard({
  option,
  isPlaying,
  status,
  error,
  onPlay,
  onStop,
  onImport,
}: CopilotMidiOptionCardProps) {
  const layout = useMemo(
    () => notesToPreviewLayout(option.notes, option.lengthBeats, PREVIEW_WIDTH, PREVIEW_HEIGHT),
    [option.lengthBeats, option.notes],
  );
  return (
    <article
      className="copilot-midi-option-card"
      draggable
      onDragStart={event => {
        event.dataTransfer.setData(COPILOT_MIDI_OPTION_DRAG_TYPE, encodeCopilotMidiOptionDrag(option));
        event.dataTransfer.effectAllowed = 'copy';
      }}>
      <div className="copilot-midi-option-header">
        <div>
          <strong>{option.label}</strong>
          <span>{roleLabel(option.role)} · {option.target.label ?? option.target.instrumentId}</span>
        </div>
        <span>{option.lengthBeats} beats</span>
      </div>
      <svg
        className="copilot-midi-option-preview"
        viewBox={`0 0 ${PREVIEW_WIDTH} ${PREVIEW_HEIGHT}`}
        role="img"
        aria-label={`${option.label} MIDI preview`}>
        {layout.gridLines.map(line => (
          <line
            key={line.key}
            x1={line.left}
            x2={line.left}
            y1="0"
            y2={PREVIEW_HEIGHT}
            className={line.isBar ? 'bar' : ''}
          />
        ))}
        {layout.notes.map(note => (
          <rect
            key={note.key}
            x={note.left}
            y={note.top}
            width={note.width}
            height={note.height}
            opacity={note.opacity}
            rx="2"
          />
        ))}
      </svg>
      <div className="copilot-midi-option-meta">
        <span>{noteRangeLabel(option)}</span>
        {option.description ? <span>{option.description}</span> : null}
      </div>
      {status ? <p className="copilot-midi-option-status">{status}</p> : null}
      {error ? <p className="copilot-midi-option-error">{error}</p> : null}
      <div className="copilot-midi-option-actions">
        <button type="button" onClick={() => (isPlaying ? onStop() : onPlay(option))} title={isPlaying ? 'Stop preview' : 'Play preview'} aria-label={isPlaying ? 'Stop preview' : 'Play preview'}>
          {isPlaying ? <StopSquareIcon /> : <PlayTriangleIcon />}
        </button>
        <button type="button" onClick={() => onImport(option)} title="Import MIDI option" aria-label="Import MIDI option">
          <ImportArrowIcon />
        </button>
        <span aria-hidden="true">Drag to timeline</span>
      </div>
    </article>
  );
}
