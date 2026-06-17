import React from 'react';
import {fireEvent, render, screen} from '@testing-library/react';

import {PianoRollKeyboardStrip} from '../src/web/components/PianoRollKeyboardStrip';
import {
  DEFAULT_PIANO_ROLL_LANE_HEIGHT,
  PIANO_ROLL_LANE_COUNT,
  PIANO_ROLL_RULER_HEIGHT,
  noteRow,
  pianoRollEditorSurfaceHeight,
  pianoRollKeyStyle,
  pianoRollKeyboardSeamStyles,
  pianoRollSurfaceHeight,
} from '../src/web/components/pianoRollGeometry';

const surfaceHeight = pianoRollSurfaceHeight(DEFAULT_PIANO_ROLL_LANE_HEIGHT);
const rowHeight = 100 / PIANO_ROLL_LANE_COUNT;

function renderKeyboard(onAuditionStart = jest.fn(), onAuditionEnd = jest.fn()) {
  const result = render(
    <PianoRollKeyboardStrip
      activeNotes={new Set()}
      surfaceHeight={surfaceHeight}
      onAuditionStart={onAuditionStart}
      onAuditionEnd={onAuditionEnd}
    />,
  );
  return {...result, onAuditionStart, onAuditionEnd};
}

describe('PianoRollKeyboardStrip', () => {
  it('aligns black keys exactly to their corresponding grid rows', () => {
    renderKeyboard();

    const blackKeys = [
      ['C#4', 61],
      ['D#4', 63],
      ['F#4', 66],
      ['G#4', 68],
      ['A#4', 70],
    ] as const;

    for (const [label, note] of blackKeys) {
      const key = screen.getByRole('button', {name: label});
      const style = pianoRollKeyStyle(note);
      expect(key).toHaveClass('black');
      expect(key).toHaveStyle({top: style.top, height: style.height});
      expect(key.style.height).toBe(`${rowHeight}%`);
      expect(noteRow(note)).toBeGreaterThanOrEqual(0);
    }
  });

  it('renders white keys as the same exact row height as the chromatic grid', () => {
    renderKeyboard();

    const c4 = screen.getByRole('button', {name: 'C4'});
    const style = pianoRollKeyStyle(60);
    expect(c4).toHaveClass('white');
    expect(c4).toHaveStyle({top: style.top, height: style.height});
    expect(c4.style.height).toBe(`${rowHeight}%`);
  });

  it('keeps black keys visually shorter in width without changing their row alignment', () => {
    renderKeyboard();

    const c4 = screen.getByRole('button', {name: 'C4'});
    const cSharp4 = screen.getByRole('button', {name: 'C#4'});
    expect(c4).toHaveStyle({width: '100%'});
    expect(cSharp4).toHaveStyle({width: '64%'});
    expect(cSharp4).toHaveClass('black');
    expect(cSharp4.style.getPropertyValue('--black-key-height')).toBe('100%');
  });

  it('reserves matching ruler and note-surface heights', () => {
    const {container} = renderKeyboard();
    const strip = container.querySelector('.piano-roll-key-strip') as HTMLDivElement;
    const stack = container.querySelector('.piano-roll-key-stack') as HTMLDivElement;

    expect(strip.style.height).toBe(`max(100%, ${pianoRollEditorSurfaceHeight(surfaceHeight)}px)`);
    expect(stack.style.height).toBe(`${surfaceHeight}px`);
    expect(container.querySelector('.piano-roll-key-velocity-spacer')).toBeNull();
    expect(pianoRollEditorSurfaceHeight(surfaceHeight)).toBe(surfaceHeight + PIANO_ROLL_RULER_HEIGHT);
  });

  it('collapses seams around black key rows into one center seam', () => {
    const seams = pianoRollKeyboardSeamStyles().map(seam => seam.top);
    const cSharpCenter = `${(noteRow(61) + 0.5) * rowHeight}%`;
    const cSharpTop = `${noteRow(61) * rowHeight}%`;
    const cSharpBottom = `${(noteRow(61) + 1) * rowHeight}%`;

    expect(seams).toContain(cSharpCenter);
    expect(seams).not.toContain(cSharpTop);
    expect(seams).not.toContain(cSharpBottom);
  });

  it('renders explicit white-key seam elements instead of chromatic row seams', () => {
    const {container} = renderKeyboard();
    const seamElements = Array.from(container.querySelectorAll('.piano-roll-white-seam')) as HTMLSpanElement[];
    const seamTops = seamElements.map(element => element.style.top);

    expect(seamElements).toHaveLength(pianoRollKeyboardSeamStyles().length);
    expect(seamTops).toContain(`${(noteRow(61) + 0.5) * rowHeight}%`);
    expect(seamTops).not.toContain(`${noteRow(61) * rowHeight}%`);
  });

  it('preserves MIDI audition hit testing for black keys', () => {
    const {onAuditionStart, onAuditionEnd} = renderKeyboard();

    const blackKey = screen.getByRole('button', {name: 'C#4'});
    fireEvent.pointerDown(blackKey);
    fireEvent.pointerUp(blackKey);

    expect(onAuditionStart).toHaveBeenCalledWith(61);
    expect(onAuditionEnd).toHaveBeenCalledWith(61);
  });

  it('marks active black keys so their visual body can light up', () => {
    render(
      <PianoRollKeyboardStrip
        activeNotes={new Set([61])}
        surfaceHeight={surfaceHeight}
        onAuditionStart={() => undefined}
        onAuditionEnd={() => undefined}
      />,
    );

    expect(screen.getByRole('button', {name: 'C#4'})).toHaveClass('black', 'active');
  });
});
