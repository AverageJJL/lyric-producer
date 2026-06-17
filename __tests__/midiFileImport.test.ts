import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../src/music/midiFileExport';
import {midiBytesFromBase64, parseMidiFile} from '../src/music/midiFileImport';

function fixtureMidiBytes(): Uint8Array {
  const snapshot = emptyProjectSnapshot();
  snapshot.tracks = [{
    id: 'track-1',
    name: 'Lead',
    isMuted: false,
    isSolo: false,
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  }];
  snapshot.blocks = [{
    id: 'clip-1',
    trackId: 'track-1',
    name: 'Lead',
    startBeat: 2,
    lengthBeats: 4,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 64, velocity: 90, startBeat: 0.5, lengthBeats: 1}],
  }];
  return midiFileBytesFromSnapshot(snapshot)!;
}

describe('midi file import', () => {
  it('parses Standard MIDI File note events into DAW notes', () => {
    const tracks = parseMidiFile(fixtureMidiBytes());

    expect(tracks).toHaveLength(1);
    expect(tracks[0]).toMatchObject({name: 'Lead', lengthBeats: 3.5});
    expect(tracks[0]?.notes).toEqual([
      {note: 64, velocity: 90, startBeat: 2.5, lengthBeats: 1},
    ]);
  });

  it('decodes base64 MIDI payloads', () => {
    const bytes = fixtureMidiBytes();
    expect(midiBytesFromBase64(midiBytesToBase64(bytes))).toEqual(bytes);
  });
});
