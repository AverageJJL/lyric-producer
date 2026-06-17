import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {useDAWStore} from '../src/store/useDAWStore';
import {PianoRollPanel} from '../src/web/components/PianoRollPanel';
import {
  DEFAULT_PIANO_ROLL_LANE_HEIGHT,
  DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT,
  pianoRollEditorSurfaceHeight,
  pianoRollSurfaceHeight,
  pianoRollSurfaceWidth,
} from '../src/web/components/pianoRollGeometry';
import {
  block,
  installGridRect,
  noteY,
  penNote,
  resetPianoRollStore,
  ShortcutProbe,
  track,
} from './helpers/pianoRollPanelTestSetup';

const mockSendNativeAudioCommand = jest.fn((_command?: string, _payload?: Record<string, unknown>) => '{"ok":true}');

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: (command: string, payload: Record<string, unknown>) =>
    mockSendNativeAudioCommand(command, payload),
}));

describe('PianoRollPanel', () => {
  beforeEach(() => {
    resetPianoRollStore();
    mockSendNativeAudioCommand.mockClear();
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

  it('edits selected note fields through store history actions', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);

    fireEvent.change(screen.getByLabelText('Velocity'), {target: {value: '64'}});

    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.velocity).toBe(64);
    expect(useDAWStore.getState().canUndo()).toBe(true);
  });

  it('keeps header editing actions without Add or Delete buttons', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);

    expect(screen.queryByRole('button', {name: 'Add'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Delete'})).toBeNull();
    expect(screen.queryByRole('button', {name: 'Audition'})).toBeNull();

    fireEvent.click(screen.getByRole('button', {name: 'Quantize'}));
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.25);

    fireEvent.click(screen.getByRole('button', {name: '+12'}));
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.note).toBe(72);
  });

  it('supports piano-roll keyboard shortcuts for selected notes', () => {
    render(<><ShortcutProbe /><PianoRollPanel blockId={block.id} track={track} /></>);
    const editor = screen.getByLabelText('Piano roll');

    fireEvent.keyDown(editor, {key: 'q'});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.25);

    fireEvent.keyDown(editor, {key: 'ArrowUp'});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.note).toBe(61);

    fireEvent.keyDown(editor, {key: 'ArrowRight'});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.startBeat).toBe(0.5);

    fireEvent.keyDown(editor, {key: 'ArrowRight', shiftKey: true});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.lengthBeats).toBe(0.75);

    fireEvent.keyDown(editor, {key: 'l'});
    expect(useDAWStore.getState().blocks[0]?.notes?.[0]?.lengthBeats).toBe(3.5);

    fireEvent.keyDown(editor, {key: 'Backspace'});
    expect(useDAWStore.getState().blocks).toHaveLength(1);
    expect(useDAWStore.getState().blocks[0]?.notes).toHaveLength(0);
    expect(useDAWStore.getState().canUndo()).toBe(true);
  });

  it('creates a note from Cmd-click in the piano-roll grid', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);
    mockSendNativeAudioCommand.mockClear();

    penNote(grid, {x: 200, y: noteY(60)});

    const notes = useDAWStore.getState().blocks[0]?.notes ?? [];
    expect(notes).toHaveLength(2);
    expect(notes[1]).toMatchObject({note: 60, startBeat: 1, velocity: 100, lengthBeats: 0.5});
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith(
      'midi_note_on',
      expect.objectContaining({note: 60, velocity: 100}),
    );
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith(
      'midi_note_off',
      expect.objectContaining({note: 60}),
    );
  });

  it('zooms the piano roll horizontally and vertically from the editor header', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const body = container.querySelector('.piano-roll-body') as HTMLDivElement;
    const gridWrap = container.querySelector('.piano-roll-grid-wrap') as HTMLDivElement;
    const noteGrid = container.querySelector('.piano-roll-grid') as HTMLDivElement;
    const keyStrip = container.querySelector('.piano-roll-key-strip') as HTMLDivElement;
    const keyStack = container.querySelector('.piano-roll-key-stack') as HTMLDivElement;
    const bodyChildren = Array.from(body.children);
    const inspector = bodyChildren[0] as HTMLElement;

    expect(inspector).toHaveClass('piano-roll-inspector');
    expect(inspector.children[0]).toHaveClass('piano-roll-fields');
    expect(inspector.children[1]).toHaveClass('piano-roll-list');
    expect(bodyChildren[1]).toHaveClass('piano-roll-main-scroll');
    const defaultHeight = pianoRollSurfaceHeight(DEFAULT_PIANO_ROLL_LANE_HEIGHT);
    const defaultWidth = pianoRollSurfaceWidth(block.lengthBeats, DEFAULT_PIANO_ROLL_PIXELS_PER_BEAT);
    expect(gridWrap.style.height).toBe(`max(100%, ${pianoRollEditorSurfaceHeight(defaultHeight)}px)`);
    expect(gridWrap.style.width).toBe(`max(100%, ${defaultWidth}px)`);
    expect(keyStrip.style.height).toBe(`max(100%, ${pianoRollEditorSurfaceHeight(defaultHeight)}px)`);
    expect(noteGrid.style.height).toBe(`${defaultHeight}px`);
    expect(keyStack.style.height).toBe(`${defaultHeight}px`);
    expect(container.querySelector('.piano-roll-velocity-lane')).toBeNull();
    expect(container.querySelector('.piano-roll-key-velocity-spacer')).toBeNull();

    fireEvent.change(screen.getByLabelText('Piano roll vertical zoom'), {target: {value: '32'}});
    fireEvent.change(screen.getByLabelText('Piano roll horizontal zoom'), {target: {value: '240'}});

    expect(gridWrap.style.height).toBe(`max(100%, ${pianoRollEditorSurfaceHeight(pianoRollSurfaceHeight(32))}px)`);
    expect(keyStrip.style.height).toBe(`max(100%, ${pianoRollEditorSurfaceHeight(pianoRollSurfaceHeight(32))}px)`);
    expect(noteGrid.style.height).toBe(`${pianoRollSurfaceHeight(32)}px`);
    expect(keyStack.style.height).toBe(`${pianoRollSurfaceHeight(32)}px`);
    expect(gridWrap.style.width).toBe(`max(100%, ${pianoRollSurfaceWidth(block.lengthBeats, 240)}px)`);
  });

  it('uses the edited note length for the next pen-click note', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);

    fireEvent.change(screen.getByLabelText('Length'), {target: {value: '1.25'}});
    penNote(grid, {x: 400, y: noteY(64)});

    const notes = useDAWStore.getState().blocks[0]?.notes ?? [];
    expect(notes.at(-1)).toMatchObject({note: 64, startBeat: 2, lengthBeats: 1.25});
  });

  it('lets pen-drag right create a longer note', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);

    penNote(grid, {x: 200, endX: 400, y: noteY(60)});

    expect(useDAWStore.getState().blocks[0]?.notes?.at(-1)).toMatchObject({
      startBeat: 1,
      lengthBeats: 1.5,
    });
  });

  it('lets pen-drag left shorten and clamp the note', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);

    penNote(grid, {x: 400, endX: 200, y: noteY(60)});

    expect(useDAWStore.getState().blocks[0]?.notes?.at(-1)).toMatchObject({
      startBeat: 2,
      lengthBeats: 0.125,
    });
  });

  it('shows pen mode on the grid while Cmd is pressed', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes');

    fireEvent.keyDown(window, {key: 'Meta', metaKey: true});
    expect(grid).toHaveClass('pen-mode');

    fireEvent.keyUp(window, {key: 'Meta', metaKey: false});
    expect(grid).not.toHaveClass('pen-mode');
  });

  it('moves an existing MIDI note by dragging without Cmd', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    const noteButton = container.querySelector('.piano-roll-note') as HTMLButtonElement;
    installGridRect(grid);
    noteButton.setPointerCapture = jest.fn();
    noteButton.releasePointerCapture = jest.fn();

    fireEvent.pointerDown(noteButton, {pointerId: 1, clientX: 100, clientY: 100});
    fireEvent.pointerMove(noteButton, {pointerId: 1, clientX: 300, clientY: 84});
    fireEvent.pointerUp(noteButton, {pointerId: 1, clientX: 300, clientY: 84});

    expect(useDAWStore.getState().blocks[0]?.notes?.[0]).toMatchObject({
      note: 61,
      startBeat: 1.13,
    });
  });

  it('moves notes without changing the remembered pen-click length', () => {
    const {container} = render(<PianoRollPanel blockId={block.id} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);

    fireEvent.change(screen.getByLabelText('Length'), {target: {value: '1.25'}});
    penNote(grid, {x: 200, y: noteY(64)});
    const addedNote = container.querySelectorAll('.piano-roll-note')[1] as HTMLButtonElement;
    addedNote.setPointerCapture = jest.fn();
    addedNote.releasePointerCapture = jest.fn();

    fireEvent.pointerDown(addedNote, {pointerId: 1, clientX: 100, clientY: 100});
    fireEvent.pointerMove(addedNote, {pointerId: 1, clientX: 300, clientY: 100});
    fireEvent.pointerUp(addedNote, {pointerId: 1, clientX: 300, clientY: 100});
    penNote(grid, {x: 100, y: noteY(60)});

    expect(useDAWStore.getState().blocks[0]?.notes?.at(-1)?.lengthBeats).toBe(1.25);
  });

  it('creates a MIDI clip before adding a note when no region is selected', () => {
    useDAWStore.setState({
      blocks: [],
      selectedBlockId: null,
      selectedBlockIds: [],
      playheadBeat: 8.2,
    });
    render(<PianoRollPanel blockId={null} track={track} />);
    const grid = screen.getByLabelText('MIDI notes') as HTMLDivElement;
    installGridRect(grid);

    penNote(grid, {x: 100, y: noteY(60), ctrlKey: true});

    const state = useDAWStore.getState();
    expect(state.blocks).toHaveLength(1);
    expect(state.blocks[0]).toMatchObject({
      name: 'MIDI',
      startBeat: 8,
      lengthBeats: 16,
      trackId: track.id,
    });
    expect(state.selectedBlockId).toBe(state.blocks[0]?.id);
    expect(state.blocks[0]?.notes?.[0]).toMatchObject({note: 60, startBeat: 2});
  });

  it('auditions notes from the folded piano keyboard strip', () => {
    render(<PianoRollPanel blockId={block.id} track={track} />);

    fireEvent.pointerDown(screen.getByRole('button', {name: 'C3'}));
    fireEvent.pointerUp(screen.getByRole('button', {name: 'C3'}));

    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith(
      'midi_note_on',
      expect.objectContaining({note: 48}),
    );
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith(
      'midi_note_off',
      expect.objectContaining({note: 48}),
    );
  });
});
