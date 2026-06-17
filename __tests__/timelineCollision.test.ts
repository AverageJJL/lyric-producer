import {
  clampMoveStartBeat,
  clampResizeFromLeft,
  clampResizeFromRight,
  recordingClipLengthBeats,
  resolvePasteOverlaps,
  resolveRecordingOverlapOnBlock,
  resolveRecordingOverlaps,
} from '../src/music/timelineCollision';
import type {DAWBlock} from '../src/store/useDAWStore';

const TIMELINE = 64;

function block(
  id: string,
  trackId: string,
  startBeat: number,
  lengthBeats: number,
): DAWBlock {
  return {
    id,
    trackId,
    type: 'midi',
    startBeat,
    lengthBeats,
    name: id,
    color: '#000',
    notes: [],
  };
}

describe('clampMoveStartBeat', () => {
  const blocks = [
    block('a', 't1', 0, 4),
    block('b', 't1', 8, 4),
    block('c', 't1', 16, 4),
  ];

  it('snaps to the right side when closer', () => {
    expect(clampMoveStartBeat(blocks, 'a', 't1', 4, 10, TIMELINE)).toBe(12);
  });

  it('snaps to the left side when closer', () => {
    expect(clampMoveStartBeat(blocks, 'a', 't1', 4, 6, TIMELINE)).toBe(4);
  });

  it('uses the nearest open slot when the gap is too small for the clip length', () => {
    expect(clampMoveStartBeat(blocks, 'a', 't1', 8, 10, TIMELINE)).toBe(0);
  });
});

describe('clampResizeFromRight', () => {
  it('stops before the next block on the same track', () => {
    const blocks = [block('a', 't1', 0, 4), block('b', 't1', 8, 4)];
    expect(clampResizeFromRight(blocks, 'a', 't1', 0, 20, TIMELINE)).toBe(8);
  });

  it('allows resizing beyond the legacy 64-beat cap when timeline extent is larger', () => {
    const blocks = [block('a', 't1', 0, 4)];
    expect(clampResizeFromRight(blocks, 'a', 't1', 0, 100, 128)).toBe(100);
  });
});

describe('clampResizeFromLeft', () => {
  it('stops when the left edge hits an existing block', () => {
    const blocks = [block('a', 't1', 4, 4), block('b', 't1', 12, 4)];
    const result = clampResizeFromLeft(blocks, 'b', 't1', 6, 16);
    expect(result.startBeat).toBe(8);
    expect(result.lengthBeats).toBe(8);
  });
});

describe('recordingClipLengthBeats', () => {
  it('shrinks inflated UI length to the last note end', () => {
    const clip = block('rec', 't1', 0, 40);
    const notes = [
      {note: 60, velocity: 100, startBeat: 1, lengthBeats: 2},
      {note: 64, velocity: 100, startBeat: 3, lengthBeats: 1},
    ];
    expect(recordingClipLengthBeats(clip, notes)).toBe(5);
  });
});

describe('resolvePasteOverlaps', () => {
  it('splits an existing clip when paste lies strictly inside it', () => {
    const existing = block('old', 't1', 8, 8);
    const pasted = block('paste', 't1', 10, 2);
    const result = resolvePasteOverlaps([existing], pasted);
    expect(result.find(item => item.id === 'old')).toMatchObject({startBeat: 8, lengthBeats: 2});
    expect(result.find(item => item.id === 'old-tail-12')).toMatchObject({startBeat: 12, lengthBeats: 4});
    expect(result.find(item => item.id === 'paste')).toBeDefined();
  });
});

describe('resolveRecordingOverlaps', () => {
  it('keeps the head when only the tail is overdubbed', () => {
    const existing = block('old', 't1', 8, 4);
    const recording = block('rec', 't1', 10, 8);
    const result = resolveRecordingOverlaps([existing, recording], 'rec');
    expect(result).toHaveLength(2);
    expect(result.find(item => item.id === 'old')).toMatchObject({startBeat: 8, lengthBeats: 2});
  });

  it('keeps the tail when only the head is overdubbed', () => {
    const existing = block('old', 't1', 8, 4);
    const recording = block('rec', 't1', 4, 6);
    const result = resolveRecordingOverlaps([existing, recording], 'rec');
    expect(result.find(item => item.startBeat === 10)).toMatchObject({startBeat: 10, lengthBeats: 2});
  });

  it('splits when the recording lies strictly inside the existing clip', () => {
    const existing = block('old', 't1', 8, 8);
    const recording = block('rec', 't1', 10, 2);
    const result = resolveRecordingOverlaps([existing, recording], 'rec');
    const head = result.find(item => item.id === 'old');
    const tail = result.find(item => item.id === 'old-tail-12');
    expect(head).toMatchObject({startBeat: 8, lengthBeats: 2});
    expect(tail).toMatchObject({startBeat: 12, lengthBeats: 4});
  });

  it('removes the clip only when the recording fully covers it', () => {
    const existing = block('old', 't1', 8, 4);
    const recording = block('rec', 't1', 6, 8);
    const result = resolveRecordingOverlaps([existing, recording], 'rec');
    expect(result.find(item => item.id === 'old')).toBeUndefined();
  });

  it('does not delete when UI growth exceeded notes but finalize trims length', () => {
    const existing = block('old', 't1', 8, 4);
    const recording = {...block('rec', 't1', 0, 40), notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 2}]};
    const trimmedLength = recordingClipLengthBeats(recording, recording.notes ?? []);
    const trimmed = {...recording, lengthBeats: trimmedLength};
    const result = resolveRecordingOverlaps([existing, trimmed], 'rec');
    expect(result.find(item => item.id === 'old')).toMatchObject({startBeat: 8, lengthBeats: 4});
  });
});

describe('resolveRecordingOverlapOnBlock', () => {
  it('omits segments shorter than one beat', () => {
    const existing = block('old', 't1', 8, 4);
    expect(resolveRecordingOverlapOnBlock(existing, 9, 11)).toHaveLength(2);
    const partial = resolveRecordingOverlapOnBlock(existing, 11, 12.2);
    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatchObject({startBeat: 8, lengthBeats: 3});
  });
});
