import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../src/music/midiFileExport';
import {parseMidiFile} from '../src/music/midiFileImport';

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

function track(id: string, name: string) {
  return {
    id,
    name,
    isMuted: false,
    isSolo: false,
    type: 'software_instrument' as const,
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isRecordArmed: false,
    isLocked: false,
  };
}

describe('midi file export', () => {
  it('serializes MIDI clips into a Standard MIDI File', () => {
    const snapshot = emptyProjectSnapshot();
    snapshot.bpm = 120;
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
      notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
    }];

    const bytes = midiFileBytesFromSnapshot(snapshot);

    expect(bytes).not.toBeNull();
    expect(ascii(bytes!, 0, 4)).toBe('MThd');
    expect(ascii(bytes!, 14, 4)).toBe('MTrk');
    expect(midiBytesToBase64(bytes!)).toMatch(/TVRoZA/);
  });

  it('returns null when there are no MIDI notes to export', () => {
    expect(midiFileBytesFromSnapshot(emptyProjectSnapshot())).toBeNull();
  });

  it('exports only selected MIDI clips and shifts them to the start', () => {
    const snapshot = emptyProjectSnapshot();
    snapshot.bpm = 120;
    snapshot.tracks = [track('lead', 'Lead'), track('pad', 'Pad')];
    snapshot.blocks = [
      {
        id: 'clip-lead',
        trackId: 'lead',
        name: 'Lead',
        startBeat: 8,
        lengthBeats: 4,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 62, velocity: 90, startBeat: 1, lengthBeats: 1}],
      },
      {
        id: 'clip-pad',
        trackId: 'pad',
        name: 'Pad',
        startBeat: 0,
        lengthBeats: 4,
        type: 'midi',
        color: '#9a7fd4',
        notes: [{note: 48, velocity: 80, startBeat: 0, lengthBeats: 1}],
      },
    ];

    const exported = parseMidiFile(midiFileBytesFromSnapshot(snapshot, {
      blockIds: ['clip-lead'],
      shiftToStart: true,
    })!);

    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({
      name: 'Lead',
      notes: [{note: 62, startBeat: 1, lengthBeats: 1}],
    });
  });

  it('clips cycle-range MIDI notes and shifts the range to beat zero', () => {
    const snapshot = emptyProjectSnapshot();
    snapshot.bpm = 120;
    snapshot.tracks = [track('lead', 'Lead')];
    snapshot.blocks = [{
      id: 'clip-lead',
      trackId: 'lead',
      name: 'Lead',
      startBeat: 0,
      lengthBeats: 8,
      type: 'midi',
      color: '#4a7fd4',
      notes: [{note: 60, velocity: 100, startBeat: 3, lengthBeats: 4}],
    }];

    const exported = parseMidiFile(midiFileBytesFromSnapshot(snapshot, {
      range: {startBeat: 4, endBeat: 6},
      shiftToStart: true,
    })!);

    expect(exported[0]?.notes).toEqual([
      {note: 60, velocity: 100, startBeat: 0, lengthBeats: 2},
    ]);
  });
});
