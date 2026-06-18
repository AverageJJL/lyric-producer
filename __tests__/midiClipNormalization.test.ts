import {
  MIDI_CLIP_TAIL_PADDING_BEATS,
  classicQuantizeNotes,
  clipLengthFromNoteExtent,
  deriveMidiClipLength,
  normalizeMidiClip,
  normalizeMidiNotes,
  smartQuantizeNotes,
  trimNotesToClipLength,
} from '../src/music/midiClipNormalization';
import {recordingClipLengthBeats} from '../src/music/timelineCollision';
import type {DAWBlock} from '../src/store/useDAWStore';
import {BEATS_PER_BAR} from '../src/music/drumPatterns';

describe('midiClipNormalization', () => {
  it('converts tick-based AI notes to clip-local beats', () => {
    const notes = normalizeMidiNotes([
      {pitch: 60, start_tick: 0, duration_ticks: 480, velocity: 100},
      {pitch: 64, start_tick: 480, duration_ticks: 480, velocity: 90},
    ]);

    expect(notes).toHaveLength(2);
    expect(notes[0]).toMatchObject({note: 60, startBeat: 0, lengthBeats: 1});
    expect(notes[1]).toMatchObject({note: 64, startBeat: 1, lengthBeats: 1});
  });

  it('classic quantizes note starts to the grid', () => {
    const quantized = classicQuantizeNotes(
      [{note: 60, velocity: 100, startBeat: 0.13, lengthBeats: 0.5}],
      0.25,
    );
    expect(quantized[0]?.startBeat).toBe(0.25);
  });

  it('smart quantize preserves order and partial offset within range', () => {
    const chord = [
      {note: 60, velocity: 100, startBeat: 0.02, lengthBeats: 0.5},
      {note: 64, velocity: 100, startBeat: 0.05, lengthBeats: 0.5},
    ];
    const smart = smartQuantizeNotes(chord, 0.25, 0.5, 0.2);
    expect(smart[0]!.startBeat).toBeLessThan(smart[1]!.startBeat);
    expect(smart[0]!.startBeat).toBeGreaterThan(0);
    expect(smart[0]!.startBeat).toBeLessThan(0.25);
  });

  it('derives clip length from note extent rounded to bars', () => {
    const length = deriveMidiClipLength([
      {note: 60, velocity: 100, startBeat: 0, lengthBeats: 1},
      {note: 62, velocity: 100, startBeat: 2.5, lengthBeats: 0.5},
    ]);
    expect(length).toBe(BEATS_PER_BAR);
  });

  it('trims notes beyond clip end', () => {
    const trimmed = trimNotesToClipLength(
      [{note: 60, velocity: 100, startBeat: 3, lengthBeats: 2}],
      4,
    );
    expect(trimmed[0]?.lengthBeats).toBe(1);
  });

  it('adds tail padding so the last note is not flush with the clip edge', () => {
    expect(clipLengthFromNoteExtent(2.5, {minBeats: 1})).toBe(
      2.5 + MIDI_CLIP_TAIL_PADDING_BEATS,
    );
    const block: DAWBlock = {
      id: 'b1',
      trackId: 't1',
      name: 'Recorded',
      startBeat: 0,
      lengthBeats: 1,
      type: 'midi',
      color: '#000',
      notes: [{note: 60, velocity: 100, startBeat: 2, lengthBeats: 0.5}],
    };
    expect(recordingClipLengthBeats(block, block.notes!)).toBeGreaterThan(2.5);
  });

  it('normalizeMidiClip sorts and applies full pipeline', () => {
    const {notes, lengthBeats} = normalizeMidiClip(
      [
        {note: 67, velocity: 80, startBeat: 1.02, lengthBeats: 0.5},
        {note: 60, velocity: 100, startBeat: 0.01, lengthBeats: 0.5},
      ],
      {quantizeMode: 'classic', gridBeats: 0.25},
    );

    expect(lengthBeats).toBeGreaterThanOrEqual(BEATS_PER_BAR);
    expect(notes[0]?.note).toBe(60);
    expect(notes[0]?.startBeat).toBe(0);
    expect(notes[1]?.startBeat).toBe(1);
  });

  it('can fit generated clips to note extents without an empty tail bar', () => {
    const {lengthBeats} = normalizeMidiClip(
      [
        {note: 60, velocity: 100, startBeat: 0, lengthBeats: 4},
        {note: 67, velocity: 100, startBeat: 12, lengthBeats: 4},
      ],
      {
        requestedLengthBeats: 16,
        respectRequestedLength: false,
        tailPaddingBeats: 0,
      },
    );

    expect(lengthBeats).toBe(16);
  });
});
