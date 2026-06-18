import type {ArrangementOperation} from '../arrangement/operations';
import {applyArrangementOperations} from '../arrangement/operations';
import {
  ELECTRIC_BASS,
  KEYS_PIANO,
  SYNTH_BASS,
  instrumentById,
} from '../music/instruments';
import {buildSampleInstrumentRegions} from '../music/sampleInstruments';
import {activeTracks} from '../music/trackOrganization';
import type {DAWBlock, DAWNote, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';

export type CopilotMidiOptionRole = 'bassline' | 'chords' | 'melody' | 'phrase';

export type CopilotMidiInstrumentIntent = {
  instrumentId: string;
  presetId: string;
  label?: string;
};

export type CopilotMidiOption = {
  id: string;
  label: string;
  role: CopilotMidiOptionRole;
  description: string;
  startBeat: number;
  lengthBeats: number;
  notes: DAWNote[];
  target: CopilotMidiInstrumentIntent;
  createTrack?: {name?: string; instrumentId?: string; presetId?: string};
};

export type CopilotMidiOptionImportResult =
  | {ok: true; trackId: string; clipId: string; startBeat: number; message: string}
  | {ok: false; error: string};

type ImportPlacement = {trackId?: string; startBeat?: number};
type Range = {min: number; max: number};

const MAX_OPTIONS = 3;
const MAX_NOTES = 256;
const DEFAULT_BASS_RANGE: Range = {min: 36, max: 60};
const DEFAULT_MELODIC_RANGE: Range = {min: 48, max: 84};
const DEFAULT_CHORD_RANGE: Range = {min: 48, max: 76};

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

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
  return Math.min(max, Math.max(min, number));
}

function roleFrom(value: unknown): CopilotMidiOptionRole {
  return value === 'bassline' || value === 'chords' || value === 'melody' || value === 'phrase'
    ? value
    : 'phrase';
}

export function playableRangeForInstrument(instrumentId: string, role: CopilotMidiOptionRole): Range {
  const instrument = instrumentById(instrumentId);
  if (instrument?.nativeInstrument === 'sample_instrument') {
    const regions = buildSampleInstrumentRegions(instrument.sampleInstrumentId ?? instrument.defaultPresetId);
    if (regions.length > 0) {
      return {
        min: Math.min(...regions.map(region => region.minNote)),
        max: Math.max(...regions.map(region => region.maxNote)),
      };
    }
  }
  if (role === 'bassline') {
    return DEFAULT_BASS_RANGE;
  }
  return role === 'chords' ? DEFAULT_CHORD_RANGE : DEFAULT_MELODIC_RANGE;
}

function defaultIntent(role: CopilotMidiOptionRole): CopilotMidiInstrumentIntent {
  const instrument = role === 'bassline' ? ELECTRIC_BASS : role === 'phrase' ? SYNTH_BASS : KEYS_PIANO;
  return {
    instrumentId: instrument.id,
    presetId: instrument.defaultPresetId,
    label: instrument.label,
  };
}

function parseIntent(value: unknown, role: CopilotMidiOptionRole): CopilotMidiInstrumentIntent {
  const fallback = defaultIntent(role);
  if (!record(value)) {
    return fallback;
  }
  const instrumentId = cleanString(value.instrumentId, fallback.instrumentId);
  const instrument = instrumentById(instrumentId);
  const presetId = cleanString(value.presetId, instrument?.defaultPresetId ?? fallback.presetId);
  return {
    instrumentId: instrument?.id ?? fallback.instrumentId,
    presetId,
    label: cleanString(value.label, instrument?.label ?? fallback.label ?? 'Instrument'),
  };
}

function parseNotes(value: unknown, lengthBeats: number, range: Range): DAWNote[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const notes: DAWNote[] = [];
  const limit = Math.min(value.length, MAX_NOTES);
  for (let index = 0; index < limit; index += 1) {
    const item = value[index];
    if (!record(item)) {
      continue;
    }
    const startBeat = finiteNumber(item.startBeat, 0);
    const requestedLength = finiteNumber(item.lengthBeats, 0.5, 0.000001);
    const safeStart = Math.min(startBeat, Math.max(0, lengthBeats - 0.000001));
    notes.push({
      note: clampInt(item.note, range.min, range.max, range.min),
      velocity: clampInt(item.velocity, 1, 127, 96),
      startBeat: safeStart,
      lengthBeats: Math.min(requestedLength, Math.max(0.05, lengthBeats - safeStart)),
    });
  }
  return notes;
}

function parseCreateTrack(value: unknown, target: CopilotMidiInstrumentIntent) {
  if (!record(value)) {
    return {
      instrumentId: target.instrumentId,
      presetId: target.presetId,
      name: target.label,
    };
  }
  return {
    instrumentId: cleanString(value.instrumentId, target.instrumentId),
    presetId: cleanString(value.presetId, target.presetId),
    name: cleanString(value.name, target.label ?? 'Instrument'),
  };
}

function parseOption(value: unknown, index: number): CopilotMidiOption | null {
  if (!record(value)) {
    return null;
  }
  const role = roleFrom(value.role);
  const target = parseIntent(value.target ?? value.instrument, role);
  const lengthBeats = finiteNumber(value.lengthBeats, 4, 0.000001);
  const range = playableRangeForInstrument(target.instrumentId, role);
  const notes = parseNotes(value.notes, lengthBeats, range);
  if (notes.length === 0) {
    return null;
  }
  return {
    id: cleanString(value.id, `option-${index + 1}`, 64),
    label: cleanString(value.label, `Option ${index + 1}`),
    role,
    description: cleanString(value.description, '', 160),
    startBeat: finiteNumber(value.startBeat, 0),
    lengthBeats,
    notes,
    target,
    createTrack: parseCreateTrack(value.createTrack, target),
  };
}

export function sanitizeCopilotMidiOptions(value: unknown): CopilotMidiOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const options: CopilotMidiOption[] = [];
  const limit = Math.min(value.length, MAX_OPTIONS);
  for (let index = 0; index < limit; index += 1) {
    const option = parseOption(value[index], index);
    if (option) {
      options.push(option);
    }
  }
  return options;
}

function isEditableSoftwareTrack(track: DAWTrack): boolean {
  return track.type === 'software_instrument' && !track.isLocked && !track.isFrozen;
}

function trackMatchesOption(track: DAWTrack, option: CopilotMidiOption): boolean {
  if (!isEditableSoftwareTrack(track)) {
    return false;
  }
  if (option.role === 'bassline') {
    return instrumentById(track.instrumentId)?.category === 'Bass';
  }
  return true;
}

function latestImportedStart(blocks: DAWBlock[], optionId: string, trackId: string): number | null {
  const prefix = `copilot-option-${optionId}`;
  const imported = blocks.filter(block => block.trackId === trackId && block.id.startsWith(prefix));
  if (imported.length === 0) {
    return null;
  }
  return Math.max(...imported.map(block => block.startBeat + block.lengthBeats));
}

function generatedTrackId(option: CopilotMidiOption): string {
  return `copilot-track-${option.id}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').slice(0, 80);
}

function generatedClipId(option: CopilotMidiOption, trackId: string, startBeat: number, blocks: DAWBlock[]): string {
  const base = `copilot-option-${option.id}-${trackId}-${Math.round(startBeat * 1000)}`
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .slice(0, 96);
  let id = base, suffix = 1;
  const ids = new Set(blocks.map(block => block.id));
  while (ids.has(id)) {
    suffix += 1;
    id = `${base}-${suffix}`;
  }
  return id;
}

export function importCopilotMidiOption(
  option: CopilotMidiOption,
  placement: ImportPlacement = {},
): CopilotMidiOptionImportResult {
  const state = useDAWStore.getState();
  const tracks = activeTracks(state.tracks);
  const explicitTrack = placement.trackId ? tracks.find(track => track.id === placement.trackId) : undefined;
  if (placement.trackId && (!explicitTrack || !isEditableSoftwareTrack(explicitTrack))) {
    return {ok: false, error: 'Drop MIDI options on an editable software instrument track.'};
  }
  const selected = state.selectedTrackId ? tracks.find(track => track.id === state.selectedTrackId) : undefined;
  const matching = tracks.find(track => track.instrumentId === option.target.instrumentId && isEditableSoftwareTrack(track));
  const targetTrack = explicitTrack ?? (selected && trackMatchesOption(selected, option) ? selected : matching);
  const shouldCreateTrack = !targetTrack;
  const trackId = targetTrack?.id ?? generatedTrackId(option);
  const appendStart = latestImportedStart(state.blocks, option.id, trackId);
  const startBeat = placement.startBeat ?? appendStart ?? option.startBeat;
  const clipId = generatedClipId(option, trackId, startBeat, state.blocks);
  const operations: ArrangementOperation[] = [];
  if (shouldCreateTrack) {
    operations.push({
      op: 'createTrack',
      templateId: 'virtual_instrument',
      trackId,
      instrumentId: option.createTrack?.instrumentId ?? option.target.instrumentId,
      presetId: option.createTrack?.presetId ?? option.target.presetId,
      name: option.createTrack?.name ?? option.target.label,
    });
  }
  operations.push({
    op: 'upsertMidiClip',
    clip: {
      id: clipId,
      trackId,
      name: option.label,
      startBeat,
      lengthBeats: option.lengthBeats,
      notes: option.notes,
      fitToNotes: true,
    },
  });
  applyArrangementOperations(operations);
  useDAWStore.setState({selectedTrackId: trackId, selectedBlockId: clipId, selectedBlockIds: [clipId], syncSource: 'ui'});
  return {ok: true, trackId, clipId, startBeat, message: `${option.label} imported at beat ${startBeat}.`};
}
