import type React from 'react';

import {handlePianoRollShortcut} from '../src/web/components/pianoRollShortcuts';
import type {DAWNote} from '../src/store/useDAWStore';

const notes: DAWNote[] = [
  {note: 60, velocity: 90, startBeat: 0.13, lengthBeats: 0.5},
  {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
];

function shortcutEvent(key: string, options: Partial<React.KeyboardEvent<HTMLElement>> = {}) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    preventDefault: jest.fn(),
    stopPropagation: jest.fn(),
    ...options,
  } as unknown as React.KeyboardEvent<HTMLElement>;
}

function shortcutContext(overrides: Partial<Parameters<typeof handlePianoRollShortcut>[1]> = {}) {
  return {
    notes,
    selectedIndexes: [0],
    hasActiveNote: true,
    noteClipboard: null,
    clipLengthBeats: 4,
    playheadRelativeBeat: null,
    setNoteClipboard: jest.fn(),
    replaceNotes: jest.fn(),
    selectIndexes: jest.fn(),
    ...overrides,
  };
}

describe('piano roll shortcut dispatcher', () => {
  it('requires Cmd/Ctrl for note clipboard and duplicate shortcuts', () => {
    for (const key of ['c', 'x', 'v', 'd']) {
      const plainEvent = shortcutEvent(key);
      const plainContext = shortcutContext();
      expect(handlePianoRollShortcut(plainEvent, plainContext)).toBe(false);
      expect(plainContext.replaceNotes).not.toHaveBeenCalled();

      const modEvent = shortcutEvent(key, {metaKey: true});
      const modContext = shortcutContext();
      expect(handlePianoRollShortcut(modEvent, modContext)).toBe(true);
      expect(modEvent.preventDefault).toHaveBeenCalled();
      expect(modEvent.stopPropagation).toHaveBeenCalled();
    }
  });

  it('keeps plain Q and L as selected-note edit shortcuts', () => {
    const quantizeContext = shortcutContext();
    handlePianoRollShortcut(shortcutEvent('q'), quantizeContext);
    expect(quantizeContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({startBeat: 0.25})]),
      [0],
    );

    const legatoContext = shortcutContext({selectedIndexes: [0, 1]});
    handlePianoRollShortcut(shortcutEvent('l'), legatoContext);
    expect(legatoContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({lengthBeats: 0.87})]),
      [0, 1],
    );
  });

  it('uses Shift+ArrowUp and Shift+ArrowDown for octave transpose', () => {
    const upContext = shortcutContext();
    handlePianoRollShortcut(shortcutEvent('ArrowUp', {shiftKey: true}), upContext);
    expect(upContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({note: 72})]),
      [0],
    );

    const downContext = shortcutContext();
    handlePianoRollShortcut(shortcutEvent('ArrowDown', {shiftKey: true}), downContext);
    expect(downContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({note: 48})]),
      [0],
    );
  });

  it('uses Shift+ArrowLeft/Right for right-edge resizing and Alt/Option arrows for fine movement', () => {
    const resizeContext = shortcutContext();
    handlePianoRollShortcut(shortcutEvent('ArrowRight', {shiftKey: true}), resizeContext);
    expect(resizeContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({lengthBeats: 0.75})]),
      [0],
    );

    const fineMoveContext = shortcutContext();
    handlePianoRollShortcut(shortcutEvent('ArrowRight', {altKey: true}), fineMoveContext);
    expect(fineMoveContext.replaceNotes).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({startBeat: 0.255})]),
      [0],
    );
  });
});
