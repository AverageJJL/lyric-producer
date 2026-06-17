import type {ProjectSnapshot} from '../arrangement/projectSnapshot';
import type {DAWBlock, DAWNote, DAWTrack} from '../store/useDAWStore';

const PPQ = 480;

export type MidiFileExportOptions = {
  blockIds?: string[];
  range?: {startBeat: number; endBeat: number};
  shiftToStart?: boolean;
};

function textBytes(value: string): number[] {
  return Array.from(value).map(char => char.charCodeAt(0) & 0x7f);
}

function numberBytes(value: number, byteCount: number): number[] {
  return Array.from({length: byteCount}, (_, index) =>
    (value >> ((byteCount - index - 1) * 8)) & 0xff,
  );
}

function variableLength(value: number): number[] {
  let buffer = value & 0x7f;
  let remaining = value >> 7;
  while (remaining > 0) {
    buffer <<= 8;
    buffer |= (remaining & 0x7f) | 0x80;
    remaining >>= 7;
  }

  const bytes: number[] = [];
  for (;;) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) {
      buffer >>= 8;
    } else {
      break;
    }
  }
  return bytes;
}

function chunk(type: string, data: number[]): number[] {
  return [...textBytes(type), ...numberBytes(data.length, 4), ...data];
}

function metaText(delta: number, type: number, value: string): number[] {
  const bytes = textBytes(value);
  return [...variableLength(delta), 0xff, type, ...variableLength(bytes.length), ...bytes];
}

function endTrack(): number[] {
  return [0x00, 0xff, 0x2f, 0x00];
}

function tempoTrack(bpm: number): number[] {
  const microsPerQuarter = Math.round(60_000_000 / Math.max(1, bpm));
  return chunk('MTrk', [
    0x00, 0xff, 0x51, 0x03,
    ...numberBytes(microsPerQuarter, 3),
    ...endTrack(),
  ]);
}

function clampMidi(value: number): number {
  return Math.max(0, Math.min(127, Math.round(value)));
}

function normalizedRange(options?: MidiFileExportOptions) {
  const start = options?.range?.startBeat;
  const end = options?.range?.endBeat;
  if (
    typeof start !== 'number' ||
    typeof end !== 'number' ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end <= start
  ) {
    return undefined;
  }
  return {startBeat: Math.max(0, start), endBeat: Math.max(0, end)};
}

function noteWindow(block: DAWBlock, note: DAWNote, options?: MidiFileExportOptions) {
  const absoluteStart = block.startBeat + note.startBeat;
  const absoluteEnd = absoluteStart + note.lengthBeats;
  const range = normalizedRange(options);
  const startBeat = range ? Math.max(absoluteStart, range.startBeat) : absoluteStart;
  const endBeat = range ? Math.min(absoluteEnd, range.endBeat) : absoluteEnd;
  return endBeat > startBeat ? {startBeat, endBeat} : null;
}

function exportStartBeat(blocks: DAWBlock[], options?: MidiFileExportOptions): number {
  const range = normalizedRange(options);
  if (!options?.shiftToStart) {
    return 0;
  }
  if (range) {
    return range.startBeat;
  }
  return Math.min(...blocks.map(block => block.startBeat));
}

function candidateBlocks(snapshot: ProjectSnapshot, options?: MidiFileExportOptions): DAWBlock[] {
  const blockIds = options?.blockIds ? new Set(options.blockIds) : null;
  return snapshot.blocks.filter(block =>
    block.type === 'midi' &&
    (block.notes?.length ?? 0) > 0 &&
    (!blockIds || blockIds.has(block.id)) &&
    block.notes!.some(note => noteWindow(block, note, options)),
  );
}

function midiEventsForBlock(
  block: DAWBlock,
  offsetBeat: number,
  options?: MidiFileExportOptions,
): Array<{tick: number; data: number[]}> {
  return (block.notes ?? []).flatMap((note: DAWNote) => {
    const window = noteWindow(block, note, options);
    if (!window) {
      return [];
    }
    const startTick = Math.max(0, Math.round((window.startBeat - offsetBeat) * PPQ));
    const endTick = Math.max(startTick + 1, Math.round((window.endBeat - offsetBeat) * PPQ));
    const midiNote = clampMidi(note.note);
    const velocity = clampMidi(note.velocity);
    return [
      {tick: startTick, data: [0x90, midiNote, velocity]},
      {tick: endTick, data: [0x80, midiNote, 0]},
    ];
  });
}

function trackChunk(
  track: DAWTrack,
  blocks: DAWBlock[],
  offsetBeat: number,
  options?: MidiFileExportOptions,
): number[] {
  const events = blocks
    .filter(block => block.trackId === track.id && block.type === 'midi')
    .flatMap(block => midiEventsForBlock(block, offsetBeat, options))
    .sort((left, right) => left.tick - right.tick || left.data[0] - right.data[0]);
  const data = [...metaText(0, 0x03, track.name)];
  let cursor = 0;

  events.forEach(event => {
    data.push(...variableLength(event.tick - cursor), ...event.data);
    cursor = event.tick;
  });

  data.push(...endTrack());
  return chunk('MTrk', data);
}

export function midiFileBytesFromSnapshot(
  snapshot: ProjectSnapshot,
  options?: MidiFileExportOptions,
): Uint8Array | null {
  const blocks = candidateBlocks(snapshot, options);
  const tracks = snapshot.tracks.filter(track =>
    blocks.some(block => block.trackId === track.id),
  );
  if (tracks.length === 0) {
    return null;
  }

  const offsetBeat = exportStartBeat(blocks, options);
  const chunks = [
    tempoTrack(snapshot.bpm),
    ...tracks.map(track => trackChunk(track, blocks, offsetBeat, options)),
  ];
  const header = chunk('MThd', [
    ...numberBytes(1, 2),
    ...numberBytes(chunks.length, 2),
    ...numberBytes(PPQ, 2),
  ]);
  return Uint8Array.from([...header, ...chunks.flat()]);
}

export function midiBytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}
