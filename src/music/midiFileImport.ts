import type {DAWNote} from '../store/useDAWStore';

export type ImportedMidiTrack = {
  name: string;
  notes: DAWNote[];
  lengthBeats: number;
};

type NoteOn = {
  startTick: number;
  velocity: number;
};

type MidiReader = {
  bytes: Uint8Array;
  offset: number;
};

function readU8(reader: MidiReader): number {
  return reader.bytes[reader.offset++] ?? 0;
}

function readU16(reader: MidiReader): number {
  return (readU8(reader) << 8) | readU8(reader);
}

function readU32(reader: MidiReader): number {
  return ((readU8(reader) << 24) | (readU8(reader) << 16) | (readU8(reader) << 8) | readU8(reader)) >>> 0;
}

function readText(reader: MidiReader, length: number): string {
  const slice = reader.bytes.slice(reader.offset, reader.offset + length);
  reader.offset += length;
  return String.fromCharCode(...slice);
}

function readVar(reader: MidiReader): number {
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    const byte = readU8(reader);
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) {
      break;
    }
  }
  return value;
}

function dataLength(status: number): number {
  const high = status & 0xf0;
  return high === 0xc0 || high === 0xd0 ? 1 : 2;
}

function closeNote(
  active: Map<string, NoteOn[]>,
  notes: DAWNote[],
  tick: number,
  ppq: number,
  channel: number,
  note: number,
): void {
  const key = `${channel}:${note}`;
  const stack = active.get(key);
  const start = stack?.shift();
  if (!start || tick <= start.startTick) {
    return;
  }
  notes.push({
    note,
    velocity: start.velocity,
    startBeat: start.startTick / ppq,
    lengthBeats: (tick - start.startTick) / ppq,
  });
}

function parseTrack(reader: MidiReader, ppq: number, fallbackName: string): ImportedMidiTrack | null {
  const length = readU32(reader);
  const end = reader.offset + length;
  const active = new Map<string, NoteOn[]>();
  const notes: DAWNote[] = [];
  let trackName = fallbackName;
  let tick = 0;
  let runningStatus = 0;

  while (reader.offset < end) {
    tick += readVar(reader);
    let status = readU8(reader);
    let firstData: number | null = null;
    if (status < 0x80) {
      firstData = status;
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
    }

    if (status === 0xff) {
      const type = readU8(reader);
      const length = readVar(reader);
      const text = readText(reader, length);
      if (type === 0x03 && text.trim()) {
        trackName = text.trim();
      }
      if (type === 0x2f) {
        break;
      }
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      reader.offset += readVar(reader);
      continue;
    }

    const length = dataLength(status);
    const data1 = firstData ?? readU8(reader);
    const data2 = length === 2 ? readU8(reader) : 0;
    const command = status & 0xf0;
    const channel = status & 0x0f;
    if (command === 0x90 && data2 > 0) {
      const key = `${channel}:${data1}`;
      active.set(key, [...(active.get(key) ?? []), {startTick: tick, velocity: data2}]);
    } else if (command === 0x80 || command === 0x90) {
      closeNote(active, notes, tick, ppq, channel, data1);
    }
  }

  reader.offset = end;
  if (notes.length === 0) {
    return null;
  }
  const lengthBeats = Math.max(1, ...notes.map(note => note.startBeat + note.lengthBeats));
  return {name: trackName, notes, lengthBeats};
}

export function midiBytesFromBase64(base64: string): Uint8Array {
  const binary = globalThis.atob(base64);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function parseMidiFile(bytes: Uint8Array): ImportedMidiTrack[] {
  const reader: MidiReader = {bytes, offset: 0};
  if (readText(reader, 4) !== 'MThd') {
    return [];
  }
  const headerLength = readU32(reader);
  const headerEnd = reader.offset + headerLength;
  readU16(reader);
  const trackCount = readU16(reader);
  const division = readU16(reader);
  reader.offset = headerEnd;
  if ((division & 0x8000) !== 0) {
    return [];
  }

  const tracks: ImportedMidiTrack[] = [];
  for (let index = 0; index < trackCount && reader.offset < bytes.length; index += 1) {
    const chunkType = readText(reader, 4);
    if (chunkType !== 'MTrk') {
      reader.offset += readU32(reader);
      continue;
    }
    const track = parseTrack(reader, division, `MIDI ${index + 1}`);
    if (track) {
      tracks.push(track);
    }
  }
  return tracks;
}
