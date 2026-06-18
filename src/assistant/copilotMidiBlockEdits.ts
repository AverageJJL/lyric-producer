import type {ArrangementOperation} from '../arrangement/operations';
import type {DAWBlock, DAWNote, DAWTrack} from '../store/useDAWStore';

export type CopilotMidiBlockEdit =
  | {op: 'upsertMidiBlock'; id?: string; trackId: string; name: string; startBeat: number; lengthBeats: number; notes: DAWNote[]}
  | {op: 'moveMidiBlock'; blockId: string; startBeat: number; trackId?: string}
  | {op: 'resizeMidiBlock'; blockId: string; startBeat: number; lengthBeats: number}
  | {op: 'renameMidiBlock'; blockId: string; name: string};

export type CopilotMidiBlockEditResult =
  | {ok: true; edits: CopilotMidiBlockEdit[]}
  | {ok: false; error: string};

export type CopilotMidiBlockApplyResult =
  | {ok: true; operations: ArrangementOperation[]; message: string}
  | {ok: false; error: string};

type EditState = {tracks: DAWTrack[]; blocks: DAWBlock[]};

const MAX_EDITS = 4;
const MAX_NOTES = 256;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: string[], path: string, allowUnknown = false): string | null {
  if (allowUnknown) {
    return null;
  }
  const allowed = new Set(keys);
  const unexpected = Object.keys(value).find(key => !allowed.has(key));
  return unexpected ? `${path}.${unexpected} is not allowed.` : null;
}

function cleanString(value: unknown, path: string, maxLength = 120): string | string[] {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return [`${path} must be a non-empty string.`];
  }
  return value.trim().slice(0, maxLength);
}

const optionalCleanString = (value: unknown, path: string): string | undefined | string[] =>
  value === undefined ? undefined : cleanString(value, path);
function finiteNumber(value: unknown, path: string, min = 0): number | string[] {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min) {
    return [`${path} must be a finite number >= ${min}.`];
  }
  return value;
}

function parseNote(value: unknown, path: string, clipLength: number): DAWNote | string[] {
  if (!record(value)) {
    return [`${path} must be a note object.`];
  }
  const extra = exactKeys(value, ['note', 'velocity', 'startBeat', 'lengthBeats'], path);
  if (extra) {
    return [extra];
  }
  const note = finiteNumber(value.note, `${path}.note`);
  const velocity = finiteNumber(value.velocity, `${path}.velocity`);
  const startBeat = finiteNumber(value.startBeat, `${path}.startBeat`);
  const lengthBeats = finiteNumber(value.lengthBeats, `${path}.lengthBeats`, 0.000001);
  if (Array.isArray(note) || Array.isArray(velocity) || Array.isArray(startBeat) || Array.isArray(lengthBeats)) {
    return [
      ...(Array.isArray(note) ? note : []),
      ...(Array.isArray(velocity) ? velocity : []),
      ...(Array.isArray(startBeat) ? startBeat : []),
      ...(Array.isArray(lengthBeats) ? lengthBeats : []),
    ];
  }
  if (!Number.isInteger(note) || note > 127 || !Number.isInteger(velocity) || velocity > 127) {
    return [`${path} must use integer MIDI note and velocity values from 0 to 127.`];
  }
  if (startBeat + lengthBeats > clipLength + 0.000001) {
    return [`${path} extends past the MIDI block length.`];
  }
  return {note, velocity, startBeat, lengthBeats};
}

function parseNotes(value: unknown, path: string, clipLength: number): DAWNote[] | string[] {
  if (!Array.isArray(value) || value.length > MAX_NOTES) {
    return [`${path} must be an array with at most ${MAX_NOTES} notes.`];
  }
  const notes: DAWNote[] = [], errors: string[] = [];
  value.forEach((item, index) => {
    const parsed = parseNote(item, `${path}[${index}]`, clipLength);
    if (Array.isArray(parsed)) errors.push(...parsed);
    else notes.push(parsed);
  });
  return errors.length > 0 ? errors : notes;
}

function parseEdit(value: unknown, index: number, allowUnknown = false): CopilotMidiBlockEdit | string[] {
  const path = `midiBlockEdits[${index}]`;
  if (!record(value) || typeof value.op !== 'string') {
    return [`${path}.op must be a supported MIDI block edit.`];
  }
  if (value.op === 'upsertMidiBlock') {
    const extra = exactKeys(value, ['op', 'id', 'trackId', 'name', 'startBeat', 'lengthBeats', 'notes'], path, allowUnknown);
    const id = optionalCleanString(value.id, `${path}.id`);
    const trackId = cleanString(value.trackId, `${path}.trackId`);
    const name = cleanString(value.name, `${path}.name`, 80);
    const startBeat = finiteNumber(value.startBeat, `${path}.startBeat`);
    const lengthBeats = finiteNumber(value.lengthBeats, `${path}.lengthBeats`, 0.000001);
    const notes = typeof lengthBeats === 'number'
      ? parseNotes(value.notes, `${path}.notes`, lengthBeats)
      : [`${path}.notes cannot be parsed until lengthBeats is valid.`];
    const errors = [
      ...(extra ? [extra] : []),
      ...(Array.isArray(id) ? id : []),
      ...(Array.isArray(trackId) ? trackId : []),
      ...(Array.isArray(name) ? name : []),
      ...(Array.isArray(startBeat) ? startBeat : []),
      ...(Array.isArray(lengthBeats) ? lengthBeats : []),
      ...(Array.isArray(notes) && notes.some(item => typeof item === 'string') ? notes as string[] : []),
    ];
    return errors.length > 0 ? errors : {op: value.op, id: id as string | undefined, trackId: trackId as string, name: name as string, startBeat: startBeat as number, lengthBeats: lengthBeats as number, notes: notes as DAWNote[]};
  }
  if (value.op === 'moveMidiBlock') {
    const extra = exactKeys(value, ['op', 'blockId', 'startBeat', 'trackId'], path, allowUnknown);
    const blockId = cleanString(value.blockId, `${path}.blockId`);
    const startBeat = finiteNumber(value.startBeat, `${path}.startBeat`);
    const trackId = value.trackId === undefined ? undefined : cleanString(value.trackId, `${path}.trackId`);
    const errors = [
      ...(extra ? [extra] : []),
      ...(Array.isArray(blockId) ? blockId : []),
      ...(Array.isArray(startBeat) ? startBeat : []),
      ...(Array.isArray(trackId) ? trackId : []),
    ];
    return errors.length > 0 ? errors : {op: value.op, blockId: blockId as string, startBeat: startBeat as number, trackId: trackId as string | undefined};
  }
  if (value.op === 'resizeMidiBlock') {
    const extra = exactKeys(value, ['op', 'blockId', 'startBeat', 'lengthBeats'], path, allowUnknown);
    const blockId = cleanString(value.blockId, `${path}.blockId`);
    const startBeat = finiteNumber(value.startBeat, `${path}.startBeat`);
    const lengthBeats = finiteNumber(value.lengthBeats, `${path}.lengthBeats`, 0.000001);
    const errors = [
      ...(extra ? [extra] : []),
      ...(Array.isArray(blockId) ? blockId : []),
      ...(Array.isArray(startBeat) ? startBeat : []),
      ...(Array.isArray(lengthBeats) ? lengthBeats : []),
    ];
    return errors.length > 0 ? errors : {op: value.op, blockId: blockId as string, startBeat: startBeat as number, lengthBeats: lengthBeats as number};
  }
  if (value.op === 'renameMidiBlock') {
    const extra = exactKeys(value, ['op', 'blockId', 'name'], path, allowUnknown);
    const blockId = cleanString(value.blockId, `${path}.blockId`);
    const name = cleanString(value.name, `${path}.name`, 80);
    const errors = [...(extra ? [extra] : []), ...(Array.isArray(blockId) ? blockId : []), ...(Array.isArray(name) ? name : [])];
    return errors.length > 0 ? errors : {op: value.op, blockId: blockId as string, name: name as string};
  }
  return [`${path}.op is not allowed.`];
}

export function parseCopilotMidiBlockEditsPayload(value: unknown): CopilotMidiBlockEditResult {
  if (value === undefined) {
    return {ok: true, edits: []};
  }
  if (!Array.isArray(value) || value.length > MAX_EDITS) {
    return {ok: false, error: `midiBlockEdits must be an array with at most ${MAX_EDITS} edits.`};
  }
  const edits: CopilotMidiBlockEdit[] = [], errors: string[] = [];
  value.forEach((item, index) => {
    const parsed = parseEdit(item, index);
    if (Array.isArray(parsed)) errors.push(...parsed);
    else edits.push(parsed);
  });
  return errors.length > 0 ? {ok: false, error: errors[0] ?? 'Invalid MIDI block edit.'} : {ok: true, edits};
}

export function sanitizeCopilotMidiBlockEdits(value: unknown): CopilotMidiBlockEdit[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_EDITS)
    .map((item, index) => parseEdit(item, index, true))
    .filter((edit): edit is CopilotMidiBlockEdit => !Array.isArray(edit));
}

function midiBlock(state: EditState, blockId: string): DAWBlock | string {
  const block = state.blocks.find(item => item.id === blockId);
  if (!block) {
    return `MIDI block ${blockId} was not found.`;
  }
  return block.type === 'midi' ? block : `Block ${blockId} is not a MIDI block.`;
}

function editableTrack(state: EditState, trackId: string): DAWTrack | string {
  const track = state.tracks.find(item => item.id === trackId);
  if (!track) {
    return `Track ${trackId} was not found.`;
  }
  if (track.type !== 'software_instrument') {
    return `Track ${trackId} is not a software instrument track.`;
  }
  if (track.isLocked || track.isFrozen) {
    return `Track ${track.name} is locked or frozen.`;
  }
  return track;
}

function unlockedBlock(state: EditState, block: DAWBlock): string | null {
  const track = state.tracks.find(item => item.id === block.trackId);
  if (block.isLocked || track?.isLocked || track?.isFrozen) {
    return `Block ${block.name} is locked or on a locked/frozen track.`;
  }
  return null;
}

function generatedMidiBlockId(reservedIds: Set<string>, trackId: string, startBeat: number): string {
  const seed = trackId.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'track';
  const base = `copilot-midi-${seed}-${Math.round(startBeat * 1000)}`;
  let id = base, suffix = 1;
  while (reservedIds.has(id)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  return id;
}

export function copilotMidiBlockEditsToOperations(
  edits: CopilotMidiBlockEdit[],
  state: EditState,
): CopilotMidiBlockApplyResult {
  const operations: ArrangementOperation[] = [];
  const reservedIds = new Set(state.blocks.map(block => block.id));
  const batchUpsertIds = new Set<string>();
  for (const edit of edits) {
    if (edit.op === 'upsertMidiBlock') {
      const track = editableTrack(state, edit.trackId);
      if (typeof track === 'string') return {ok: false, error: track};
      const clipId = edit.id ?? generatedMidiBlockId(reservedIds, edit.trackId, edit.startBeat);
      if (batchUpsertIds.has(clipId)) {
        return {ok: false, error: `MIDI block ${clipId} is targeted more than once.`};
      }
      reservedIds.add(clipId);
      batchUpsertIds.add(clipId);
      const existing = state.blocks.find(block => block.id === clipId);
      if (existing) {
        const block = midiBlock(state, clipId);
        if (typeof block === 'string') return {ok: false, error: block};
        const locked = unlockedBlock(state, block);
        if (locked) return {ok: false, error: locked};
      }
      operations.push({op: 'upsertMidiClip', clip: {...edit, id: clipId, notes: edit.notes.map(note => ({...note}))}});
    } else if (edit.op === 'moveMidiBlock') {
      const block = midiBlock(state, edit.blockId);
      if (typeof block === 'string') return {ok: false, error: block};
      const locked = unlockedBlock(state, block);
      if (locked) return {ok: false, error: locked};
      const targetTrackId = edit.trackId ?? block.trackId;
      const track = editableTrack(state, targetTrackId);
      if (typeof track === 'string') return {ok: false, error: track};
      operations.push({op: 'moveClip', clipId: edit.blockId, startBeat: edit.startBeat, trackId: edit.trackId});
    } else if (edit.op === 'resizeMidiBlock') {
      const block = midiBlock(state, edit.blockId);
      if (typeof block === 'string') return {ok: false, error: block};
      const locked = unlockedBlock(state, block);
      if (locked) return {ok: false, error: locked};
      operations.push({op: 'resizeClip', clipId: edit.blockId, startBeat: edit.startBeat, lengthBeats: edit.lengthBeats});
    } else if (edit.op === 'renameMidiBlock') {
      const block = midiBlock(state, edit.blockId);
      if (typeof block === 'string') return {ok: false, error: block};
      const locked = unlockedBlock(state, block);
      if (locked) return {ok: false, error: locked};
      operations.push({op: 'upsertMidiClip', clip: {...block, name: edit.name, notes: (block.notes ?? []).map(note => ({...note}))}});
    } else {
      return {ok: false, error: 'Unsupported MIDI block edit.'};
    }
  }
  return {ok: true, operations, message: `${operations.length} MIDI block edit${operations.length === 1 ? '' : 's'} applied.`};
}

export function describeCopilotMidiBlockEdit(edit: CopilotMidiBlockEdit): string {
  if (edit.op === 'upsertMidiBlock') {
    return `${edit.name}: ${edit.lengthBeats} beats, ${edit.notes.length} notes`;
  }
  if (edit.op === 'moveMidiBlock') {
    return `Move ${edit.blockId} to beat ${edit.startBeat}`;
  }
  if (edit.op === 'resizeMidiBlock') {
    return `Resize ${edit.blockId} to ${edit.lengthBeats} beats`;
  }
  return `Rename ${edit.blockId} to ${edit.name}`;
}
