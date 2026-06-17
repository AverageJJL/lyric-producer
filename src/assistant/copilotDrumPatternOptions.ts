import type {ArrangementOperation} from '../arrangement/operations';
import {applyArrangementOperations} from '../arrangement/operations';
import {DRUM_SAMPLE_KEYS, type DrumSampleKey, POP_DRUM_KIT_ID} from '../assets/drumKit';
import {createDefaultDrumPatternBlock} from '../music/clipFactories';
import {
  createEmptyPattern,
  normalizeDrumPattern,
  STEPS_PER_BAR,
  type DrumPattern,
} from '../music/drumPatterns';
import {activeTracks} from '../music/trackOrganization';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';

export type CopilotDrumPatternLanes = Record<DrumSampleKey, number[]>;

export type CopilotDrumPatternOption = {
  id: string;
  label: string;
  description: string;
  startBeat: number;
  lengthBeats: number;
  kitId: string;
  lanes: CopilotDrumPatternLanes;
};

export type CopilotDrumPatternEdit = {
  op: 'replaceDrumPattern';
  blockId: string;
  name?: string;
  lanes: CopilotDrumPatternLanes;
};

export type CopilotDrumPatternImportResult =
  | {ok: true; trackId: string; clipId: string; patternId: string; startBeat: number; message: string}
  | {ok: false; error: string};

export type CopilotDrumPatternApplyResult =
  | {ok: true; operations: ArrangementOperation[]; message: string}
  | {ok: false; error: string};

type ImportPlacement = {trackId?: string; startBeat?: number};

const MAX_OPTIONS = 3;
const MAX_EDITS = 4;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanString(value: unknown, fallback: string, maxLength = 80): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

function finiteNumber(value: unknown, fallback: number, min = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min ? value : fallback;
}

function emptyLanes(): CopilotDrumPatternLanes {
  const lanes = {} as CopilotDrumPatternLanes;
  DRUM_SAMPLE_KEYS.forEach(key => {
    lanes[key] = [];
  });
  return lanes;
}

export function sanitizeCopilotDrumLanes(value: unknown): CopilotDrumPatternLanes {
  const lanes = emptyLanes();
  if (!record(value)) {
    return lanes;
  }
  DRUM_SAMPLE_KEYS.forEach(key => {
    const raw = value[key];
    if (!Array.isArray(raw)) {
      return;
    }
    lanes[key] = Array.from(new Set(raw
      .filter(step => typeof step === 'number' && Number.isFinite(step))
      .map(step => Math.round(step))
      .filter(step => step >= 0 && step < STEPS_PER_BAR)))
      .sort((a, b) => a - b);
  });
  return lanes;
}

function hasAnyStep(lanes: CopilotDrumPatternLanes): boolean {
  return DRUM_SAMPLE_KEYS.some(key => lanes[key].length > 0);
}

function parseOption(value: unknown, index: number): CopilotDrumPatternOption | null {
  if (!record(value)) {
    return null;
  }
  const lanes = sanitizeCopilotDrumLanes(value.lanes);
  if (!hasAnyStep(lanes)) {
    return null;
  }
  return {
    id: cleanString(value.id, `drums-${index + 1}`, 64),
    label: cleanString(value.label, `Drum Beat ${index + 1}`),
    description: cleanString(value.description, '', 160),
    startBeat: finiteNumber(value.startBeat, 0),
    lengthBeats: finiteNumber(value.lengthBeats, 4, 0.000001),
    kitId: cleanString(value.kitId, POP_DRUM_KIT_ID, 64),
    lanes,
  };
}

export function sanitizeCopilotDrumPatternOptions(value: unknown): CopilotDrumPatternOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_OPTIONS)
    .map(parseOption)
    .filter((option): option is CopilotDrumPatternOption => option !== null);
}

function parseEdit(value: unknown): CopilotDrumPatternEdit | null {
  if (!record(value) || value.op !== 'replaceDrumPattern' || typeof value.blockId !== 'string') {
    return null;
  }
  const lanes = sanitizeCopilotDrumLanes(value.lanes);
  return hasAnyStep(lanes)
    ? {op: 'replaceDrumPattern', blockId: value.blockId, name: cleanString(value.name, '', 80) || undefined, lanes}
    : null;
}

export function sanitizeCopilotDrumPatternEdits(value: unknown): CopilotDrumPatternEdit[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_EDITS)
    .map(parseEdit)
    .filter((edit): edit is CopilotDrumPatternEdit => edit !== null);
}

export function patternFromCopilotDrumLanes(
  lanes: CopilotDrumPatternLanes,
  name: string,
  id: string,
): DrumPattern {
  const pattern = createEmptyPattern(name, id);
  DRUM_SAMPLE_KEYS.forEach(key => {
    lanes[key].forEach(step => {
      pattern.steps[key][step] = true;
    });
  });
  return normalizeDrumPattern(pattern);
}

function isEditableDrumTrack(track: DAWTrack): boolean {
  return track.type === 'drum_machine' && !track.isLocked && !track.isFrozen;
}

function generatedId(prefix: string, optionId: string, trackId: string, startBeat: number): string {
  return `${prefix}-${optionId}-${trackId}-${Math.round(startBeat * 1000)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 96);
}

function latestImportedStart(blocks: DAWBlock[], optionId: string, trackId: string): number | null {
  const prefix = `copilot-drum-${optionId}`;
  const imported = blocks.filter(block => block.trackId === trackId && block.id.startsWith(prefix));
  return imported.length ? Math.max(...imported.map(block => block.startBeat + block.lengthBeats)) : null;
}

export function importCopilotDrumPatternOption(
  option: CopilotDrumPatternOption,
  placement: ImportPlacement = {},
): CopilotDrumPatternImportResult {
  let state = useDAWStore.getState();
  let tracks = activeTracks(state.tracks);
  const explicitTrack = placement.trackId ? tracks.find(track => track.id === placement.trackId) : undefined;
  if (placement.trackId && (!explicitTrack || !isEditableDrumTrack(explicitTrack))) {
    return {ok: false, error: 'Drop drum patterns on an editable drum machine track.'};
  }

  const selected = state.selectedTrackId ? tracks.find(track => track.id === state.selectedTrackId) : undefined;
  let targetTrack = explicitTrack ?? (selected && isEditableDrumTrack(selected) ? selected : undefined) ??
    tracks.find(isEditableDrumTrack);
  let reusableDefaultBlock: DAWBlock | undefined;
  const operations: ArrangementOperation[] = [];

  if (!targetTrack) {
    const trackId = `copilot-drum-track-${option.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80);
    applyArrangementOperations([{op: 'createTrack', templateId: 'drum_machine', trackId, name: 'Drum Machine'}]);
    state = useDAWStore.getState();
    tracks = activeTracks(state.tracks);
    targetTrack = tracks.find(track => track.id === trackId);
    reusableDefaultBlock = state.blocks.find(block => block.trackId === trackId && block.patternId);
  }

  if (!targetTrack) {
    return {ok: false, error: 'Could not create a drum machine track.'};
  }

  const appendStart = latestImportedStart(state.blocks, option.id, targetTrack.id);
  const startBeat = placement.startBeat ?? appendStart ?? option.startBeat;
  const patternId = generatedId('copilot-drum-pattern', option.id, targetTrack.id, startBeat);
  const clipId = reusableDefaultBlock?.id ?? generatedId('copilot-drum', option.id, targetTrack.id, startBeat);
  const pattern = patternFromCopilotDrumLanes(option.lanes, option.label, patternId);
  operations.push({op: 'upsertDrumPattern', pattern});
  operations.push({
    op: 'upsertDrumClip',
    clip: {id: clipId, trackId: targetTrack.id, name: option.label, startBeat, lengthBeats: option.lengthBeats, patternId},
  });
  applyArrangementOperations(operations);
  useDAWStore.setState({selectedTrackId: targetTrack.id, selectedBlockId: clipId, selectedBlockIds: [clipId], syncSource: 'ui'});
  return {ok: true, trackId: targetTrack.id, clipId, patternId, startBeat, message: `${option.label} imported at beat ${startBeat}.`};
}

export function copilotDrumPatternEditsToOperations(
  edits: CopilotDrumPatternEdit[],
  state = useDAWStore.getState(),
): CopilotDrumPatternApplyResult {
  const operations: ArrangementOperation[] = [];
  for (const edit of edits) {
    const block = state.blocks.find(item => item.id === edit.blockId);
    const track = block ? state.tracks.find(item => item.id === block.trackId) : undefined;
    if (!block || !block.patternId) return {ok: false, error: `Drum pattern block ${edit.blockId} was not found.`};
    if (!track || !isEditableDrumTrack(track) || block.isLocked) return {ok: false, error: `Drum pattern ${block.name} is locked or unavailable.`};
    operations.push({
      op: 'upsertDrumPattern',
      pattern: patternFromCopilotDrumLanes(edit.lanes, edit.name ?? block.name, block.patternId),
    });
  }
  return {ok: true, operations, message: `${operations.length} drum pattern edit${operations.length === 1 ? '' : 's'} applied.`};
}

export function applyCopilotDrumPatternEdits(edits: CopilotDrumPatternEdit[]): CopilotDrumPatternApplyResult {
  const converted = copilotDrumPatternEditsToOperations(edits);
  if (!converted.ok) {
    return converted;
  }
  applyArrangementOperations(converted.operations);
  return converted;
}

export function describeCopilotDrumPatternEdit(edit: CopilotDrumPatternEdit): string {
  const hitCount = DRUM_SAMPLE_KEYS.reduce((count, key) => count + edit.lanes[key].length, 0);
  return `${edit.name ?? edit.blockId}: replace drum pattern with ${hitCount} hits`;
}
