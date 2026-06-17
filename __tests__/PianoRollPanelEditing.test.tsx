import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {useDAWStore, type DAWNote} from '../src/store/useDAWStore';
import {PianoRollPanel} from '../src/web/components/PianoRollPanel';
import {
  block,
  installGridRect,
  noteY,
  resetPianoRollStore,
  track,
} from './helpers/pianoRollPanelTestSetup';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: () => '{"ok":true}',
}));

const seedNotes = (notes: DAWNote[]) => {
  useDAWStore.setState({blocks: [{...block, notes}]});
};

const noteButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('.piano-roll-note')) as HTMLButtonElement[];

const setCaptureMocks = (element: HTMLElement) => {
  element.setPointerCapture = jest.fn();
  element.releasePointerCapture = jest.fn();
};

describe('PianoRollPanel editing interactions', () => {
  beforeEach(() => {
    resetPianoRollStore();
    window.PointerEvent =
      window.PointerEvent ??
      (class MockPointerEvent extends MouseEvent {
        pointerId: number;
        constructor(type: string, props: PointerEventInit = {}) {
          super(type, props);
          this.pointerId = props.pointerId ?? 0;
        }
      } as typeof PointerEvent);
  });

  it('selects all notes and deletes them with focused shortcuts', () => {
    seedNotes([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 0.5},
      {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
    ]);
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const editor = screen.getByLabelText('Piano roll');

    fireEvent.keyDown(editor, {key: 'a', metaKey: true});
    fireEvent.keyDown(editor, {key: 'Backspace'});

    expect(useDAWStore.getState().blocks[0]?.notes).toEqual([]);
  });

  it('additive-selects notes and drags the selected group together', () => {
    seedNotes([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 0.5},
      {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
    ]);
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);
    const [first, second] = noteButtons(container);
    setCaptureMocks(first);

    fireEvent.pointerDown(second, {pointerId: 2, shiftKey: true, clientX: 100, clientY: 100});
    fireEvent.pointerDown(first, {pointerId: 3, clientX: 100, clientY: 100});
    fireEvent.pointerMove(first, {pointerId: 3, clientX: 300, clientY: 84});
    fireEvent.pointerUp(first, {pointerId: 3, clientX: 300, clientY: 84});

    expect(useDAWStore.getState().blocks[0]?.notes).toMatchObject([
      {note: 61, startBeat: 1},
      {note: 65, startBeat: 2},
    ]);
  });

  it('marquee-selects notes across the grid', () => {
    seedNotes([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 0.5},
      {note: 67, velocity: 80, startBeat: 2, lengthBeats: 0.5},
    ]);
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);
    grid.setPointerCapture = jest.fn();
    grid.releasePointerCapture = jest.fn();

    fireEvent.pointerDown(grid, {pointerId: 4, clientX: 0, clientY: noteY(68)});
    fireEvent.pointerMove(grid, {pointerId: 4, clientX: 520, clientY: noteY(59)});
    fireEvent.pointerUp(grid, {pointerId: 4, clientX: 520, clientY: noteY(59)});

    expect(container.querySelectorAll('.piano-roll-note.selected')).toHaveLength(2);
  });

  it('resizes note ends from the edge handles', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);
    const note = noteButtons(container)[0];
    const endHandle = note.querySelector('.piano-roll-note-resize.end') as HTMLSpanElement;
    setCaptureMocks(note);

    fireEvent.pointerDown(endHandle, {pointerId: 5, clientX: 100, clientY: 100});
    fireEvent.pointerMove(note, {pointerId: 5, clientX: 300, clientY: 100});
    fireEvent.pointerUp(note, {pointerId: 5, clientX: 300, clientY: 100});

    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.lengthBeats).toBe(1.5);
  });

  it('keeps inline velocity indicators display-only while dragging over them', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);
    const note = noteButtons(container)[0];
    const bar = note.querySelector('.piano-roll-note-velocity') as HTMLSpanElement;
    setCaptureMocks(note);

    fireEvent.pointerDown(bar, {pointerId: 6, clientX: 100, clientY: 100});
    fireEvent.pointerMove(note, {pointerId: 6, clientX: 100, clientY: 84});
    fireEvent.pointerUp(note, {pointerId: 6, clientX: 100, clientY: 84});

    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.velocity).toBe(90);
  });

  it('copies, pastes, and duplicates selected notes with shortcuts', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const editor = screen.getByLabelText('Piano roll');

    fireEvent.keyDown(editor, {key: 'c', metaKey: true});
    fireEvent.keyDown(editor, {key: 'v', metaKey: true});
    fireEvent.keyDown(editor, {key: 'd', metaKey: true});

    const notes = useDAWStore.getState().blocks[0]?.notes ?? [];
    expect(notes).toHaveLength(3);
    expect(notes.map(note => note.startBeat)).toEqual([0.13, 1, 1.5]);
  });

  it('cuts selected notes only with Cmd/Ctrl+X', () => {
    seedNotes([
      {note: 60, velocity: 90, startBeat: 0, lengthBeats: 0.5},
      {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
    ]);
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const editor = screen.getByLabelText('Piano roll');

    fireEvent.keyDown(editor, {key: 'x'});
    expect(useDAWStore.getState().blocks[0]?.notes).toHaveLength(2);

    fireEvent.keyDown(editor, {key: 'x', metaKey: true});
    expect(useDAWStore.getState().blocks[0]?.notes).toEqual([
      {note: 64, velocity: 80, startBeat: 1, lengthBeats: 0.5},
    ]);
  });

  it('focuses the editor from the grid so Shift+Arrow shortcuts apply', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const editor = screen.getByLabelText('Piano roll');
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    const note = noteButtons(container)[0];
    installGridRect(grid);

    fireEvent.pointerDown(note, {pointerId: 7, clientX: 100, clientY: 100});
    expect(document.activeElement).toBe(editor);

    fireEvent.keyDown(editor, {key: 'ArrowUp', shiftKey: true});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.note).toBe(72);

    fireEvent.keyDown(editor, {key: 'ArrowRight', shiftKey: true});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.lengthBeats).toBe(0.75);
  });
});
