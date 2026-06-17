import {notesToPreviewLayout} from '../src/music/midiClipPreviewLayout';

describe('midiClipPreviewLayout', () => {
  it('maps normalized beats to pixel positions', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 127, startBeat: 0, lengthBeats: 1}],
      4,
      400,
      60,
    );

    expect(layout.notes).toHaveLength(1);
    expect(layout.notes[0]?.left).toBe(0);
    expect(layout.notes[0]?.width).toBe(100);
    expect(layout.notes[0]?.height).toBe(3);
    expect(layout.notes[0]?.top).toBeGreaterThanOrEqual(20);
    expect(layout.notes[0]?.opacity).toBeGreaterThan(0.9);
  });

  it('keeps MIDI preview notes thin on tall timeline rows', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
      4,
      400,
      140,
    );

    expect(layout.notes[0]?.height).toBe(3);
    expect(layout.notes[0]?.top).toBeGreaterThanOrEqual(20);
    expect((layout.notes[0]?.top ?? 0) + (layout.notes[0]?.height ?? 0)).toBeLessThanOrEqual(138);
  });

  it('keeps MIDI preview notes visible on compact timeline rows', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
      4,
      400,
      6,
    );

    expect(layout.notes[0]?.height).toBe(2);
    expect(layout.notes[0]?.top).toBeGreaterThanOrEqual(2);
    expect((layout.notes[0]?.top ?? 0) + (layout.notes[0]?.height ?? 0)).toBeLessThanOrEqual(4);
  });

  it('keeps four-beat MIDI preview content aligned to the full clip width', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 127, startBeat: 0, lengthBeats: 4}],
      4,
      400,
      60,
    );

    expect(layout.notes[0]?.left).toBe(0);
    expect(layout.notes[0]?.width).toBe(400);
    expect(layout.gridLines.filter(line => line.isBar).map(line => line.left)).toEqual([0, 400]);
  });

  it('uses the caller-provided beat width when timeline chrome is separate from content', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 127, startBeat: 0, lengthBeats: 4}],
      4,
      394,
      60,
      100,
    );

    expect(layout.notes[0]?.width).toBe(400);
    expect(layout.gridLines.filter(line => line.isBar).map(line => line.left)).toEqual([0, 400]);
  });

  it('clips notes that extend past clip length', () => {
    const layout = notesToPreviewLayout(
      [{note: 60, velocity: 100, startBeat: 3, lengthBeats: 2}],
      4,
      400,
      60,
    );

    expect(layout.notes[0]?.width).toBe(100);
  });

  it('uses adaptive pitch range for sparse clips', () => {
    const layout = notesToPreviewLayout(
      [{note: 72, velocity: 100, startBeat: 0, lengthBeats: 1}],
      4,
      200,
      40,
    );

    expect(layout.minNote).toBeLessThanOrEqual(72);
    expect(layout.maxNote).toBeGreaterThanOrEqual(72);
    expect(layout.isEmpty).toBe(false);
  });

  it('renders dense MIDI clips as thin event strokes', () => {
    const notes = Array.from({length: 16}, (_, index) => ({
      note: 60 + (index % 8),
      velocity: 72 + index,
      startBeat: index * 0.25,
      lengthBeats: 0.2,
    }));
    const layout = notesToPreviewLayout(notes, 4, 400, 80);

    expect(layout.notes).toHaveLength(16);
    expect(layout.notes.every(note => note.height === 3)).toBe(true);
    expect(layout.notes.every(note => note.top >= 20 && note.top + note.height <= 78)).toBe(true);
  });

  it('marks empty clips', () => {
    const layout = notesToPreviewLayout([], 4, 200, 40);
    expect(layout.isEmpty).toBe(true);
    expect(layout.notes).toHaveLength(0);
  });
});
