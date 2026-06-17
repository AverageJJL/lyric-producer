import {
  copilotMidiBlockEditsToOperations,
  parseCopilotMidiBlockEditsPayload,
} from '../src/assistant/copilotMidiBlockEdits';
import type {DAWBlock, DAWTrack} from '../src/store/useDAWStore';

const instrumentTrack: DAWTrack = {
  id: 'track-keys',
  name: 'Keys',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
};

const audioTrack: DAWTrack = {
  ...instrumentTrack,
  id: 'track-audio',
  name: 'Vocal',
  type: 'voice_audio',
};

const midiBlock: DAWBlock = {
  id: 'clip-keys',
  trackId: 'track-keys',
  name: 'Motif',
  startBeat: 0,
  lengthBeats: 4,
  type: 'midi',
  color: '#4a7fd4',
  notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
};

const audioBlock: DAWBlock = {
  id: 'clip-audio',
  trackId: 'track-audio',
  name: 'Vocal',
  startBeat: 0,
  lengthBeats: 4,
  type: 'audio',
  color: '#c45c26',
};

describe('Copilot MIDI block edits', () => {
  it('accepts whole MIDI block edit operations and maps them to arrangement operations', () => {
    const parsed = parseCopilotMidiBlockEditsPayload([
      {
        op: 'upsertMidiBlock',
        id: 'clip-new',
        trackId: 'track-keys',
        name: 'New Lead',
        startBeat: 4,
        lengthBeats: 4,
        notes: [{note: 64, velocity: 100, startBeat: 0, lengthBeats: 1}],
      },
      {op: 'moveMidiBlock', blockId: 'clip-keys', startBeat: 8},
      {op: 'resizeMidiBlock', blockId: 'clip-keys', startBeat: 8, lengthBeats: 2},
      {op: 'renameMidiBlock', blockId: 'clip-keys', name: 'Hook'},
    ]);

    expect(parsed).toMatchObject({ok: true});
    const result = parsed.ok
      ? copilotMidiBlockEditsToOperations(parsed.edits, {tracks: [instrumentTrack], blocks: [midiBlock]})
      : null;

    expect(result).toMatchObject({ok: true});
    expect(result?.ok ? result.operations.map(operation => operation.op) : []).toEqual([
      'upsertMidiClip',
      'moveClip',
      'resizeClip',
      'upsertMidiClip',
    ]);
    expect(result?.ok ? result.operations[3] : null).toMatchObject({
      op: 'upsertMidiClip',
      clip: {id: 'clip-keys', name: 'Hook', notes: midiBlock.notes},
    });
  });

  it('generates a MIDI block id when create upserts omit one', () => {
    const parsed = parseCopilotMidiBlockEditsPayload([{
      op: 'upsertMidiBlock',
      trackId: 'track-keys',
      name: 'Generated',
      startBeat: 0,
      lengthBeats: 4,
      notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
    }]);

    const result = parsed.ok
      ? copilotMidiBlockEditsToOperations(parsed.edits, {tracks: [instrumentTrack], blocks: []})
      : null;

    expect(result).toMatchObject({ok: true});
    expect(result?.ok ? result.operations[0] : null).toMatchObject({
      op: 'upsertMidiClip',
      clip: {id: 'copilot-midi-track-keys-0', trackId: 'track-keys'},
    });
  });

  it('reserves generated ids across a multi-edit batch', () => {
    const parsed = parseCopilotMidiBlockEditsPayload([
      {op: 'upsertMidiBlock', trackId: 'track-keys', name: 'A', startBeat: 0, lengthBeats: 4, notes: []},
      {op: 'upsertMidiBlock', trackId: 'track-keys', name: 'B', startBeat: 0, lengthBeats: 4, notes: []},
    ]);

    const result = parsed.ok
      ? copilotMidiBlockEditsToOperations(parsed.edits, {tracks: [instrumentTrack], blocks: []})
      : null;

    expect(result).toMatchObject({ok: true});
    expect(result?.ok ? result.operations.map(operation =>
      operation.op === 'upsertMidiClip' ? operation.clip.id : null,
    ) : []).toEqual(['copilot-midi-track-keys-0', 'copilot-midi-track-keys-0-2']);
  });

  it('rejects duplicate explicit upsert ids in one batch', () => {
    const edits = [
      {op: 'upsertMidiBlock' as const, id: 'clip-dupe', trackId: 'track-keys', name: 'A', startBeat: 0, lengthBeats: 4, notes: []},
      {op: 'upsertMidiBlock' as const, id: 'clip-dupe', trackId: 'track-keys', name: 'B', startBeat: 4, lengthBeats: 4, notes: []},
    ];

    expect(copilotMidiBlockEditsToOperations(edits, {tracks: [instrumentTrack], blocks: []}))
      .toMatchObject({ok: false});
  });

  it('rejects note patch operations, unknown fields, and invalid notes', () => {
    expect(parseCopilotMidiBlockEditsPayload([
      {op: 'addMidiNote', blockId: 'clip-keys', note: 60},
    ])).toMatchObject({ok: false});

    expect(parseCopilotMidiBlockEditsPayload([
      {op: 'renameMidiBlock', blockId: 'clip-keys', name: 'Hook', isMuted: true},
    ])).toMatchObject({ok: false});

    expect(parseCopilotMidiBlockEditsPayload([
      {
        op: 'upsertMidiBlock',
        id: 'clip-new',
        trackId: 'track-keys',
        name: 'Bad',
        startBeat: 0,
        lengthBeats: 4,
        notes: [{note: 200, velocity: 96, startBeat: 0, lengthBeats: 1}],
      },
    ])).toMatchObject({ok: false});
  });

  it('rejects non-MIDI blocks and locked targets', () => {
    const moveAudio = copilotMidiBlockEditsToOperations(
      [{op: 'moveMidiBlock', blockId: 'clip-audio', startBeat: 2}],
      {tracks: [instrumentTrack, audioTrack], blocks: [audioBlock]},
    );
    expect(moveAudio).toMatchObject({ok: false});

    const locked = copilotMidiBlockEditsToOperations(
      [{op: 'renameMidiBlock', blockId: 'clip-keys', name: 'Locked'}],
      {tracks: [{...instrumentTrack, isLocked: true}], blocks: [midiBlock]},
    );
    expect(locked).toMatchObject({ok: false});
  });
});
