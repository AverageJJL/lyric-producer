import {
  instrumentForTrack,
  presetLabel,
} from '../music/instruments';
import {DRUM_SAMPLE_KEYS, type DrumSampleKey} from '../assets/drumKit';
import {normalizeDrumPattern, type DrumPattern} from '../music/drumPatterns';
import type {DAWBlock, DAWTrack, DAWBlockType, TrackType} from '../store/useDAWStore';

export type CopilotTrackSummary = {
  id: string;
  name: string;
  type: TrackType;
  instrumentId: string;
  presetId: string;
  presetLabel: string;
  isSelected: boolean;
  isMuted: boolean;
  isSolo: boolean;
  isRecordArmed: boolean;
  isLocked: boolean;
  isFrozen: boolean;
  isArchived: boolean;
  isDisabled: boolean;
  routingRole?: string;
  volumeDb?: number;
  pan?: number;
  blockCount: number;
};

export type CopilotEditableMidiBlockSummary = {
  id: string;
  trackId: string;
  name: string;
  type: DAWBlockType;
  startBeat: number;
  lengthBeats: number;
  noteCount: number;
  isSelected: boolean;
  isLocked: boolean;
  trackLocked: boolean;
  trackFrozen: boolean;
};

export type CopilotDrumBlockSummary = {
  id: string;
  trackId: string;
  name: string;
  type: 'audio';
  patternId: string | null;
  startBeat: number;
  lengthBeats: number;
  lanes: Record<DrumSampleKey, number[]>;
  isSelected: boolean;
  isLocked: boolean;
  trackLocked: boolean;
  trackFrozen: boolean;
};

export type CopilotAudioBlockSummary = {
  id: string;
  trackId: string;
  name: string;
  type: 'audio';
  startBeat: number;
  lengthBeats: number;
  sourceOffsetBeats?: number;
  sourceLengthBeats?: number;
  durationSeconds?: number;
  hasWaveformPeaks: boolean;
  hasSpectrogramPng: boolean;
  spectrogramStatus: 'available' | 'pending' | 'error' | 'none';
  isMissingMedia: boolean;
  isSelected: boolean;
  isLocked: boolean;
  trackLocked: boolean;
  trackFrozen: boolean;
};

export type CopilotEditableArrangementSummary = {
  selectedTrackId: string | null;
  selectedBlockId: string | null;
  selectedMidiBlockId: string | null;
  playheadBeat: number;
  tracks: CopilotTrackSummary[];
  softwareInstrumentTracks: CopilotTrackSummary[];
  midiBlocks: CopilotEditableMidiBlockSummary[];
  drumBlocks: CopilotDrumBlockSummary[];
  audioBlocks: CopilotAudioBlockSummary[];
};

export type CopilotEditableArrangementInput = {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
  patterns?: Record<string, DrumPattern>;
  selectedTrackId: string | null;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  playheadBeat: number;
};

const MAX_TRACKS = 24;
const MAX_BLOCKS = 80;
const PATH_PATTERN = /(?:file:\/\/|\/(?:Users|Volumes|private|var|tmp)\/|[A-Za-z]:\\|\\\\)/i;

function cleanName(value: string, fallback: string): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return fallback;
  }
  if (PATH_PATTERN.test(compact)) {
    return '[path redacted]';
  }
  return compact.length > 48 ? `${compact.slice(0, 45)}...` : compact;
}

function finiteBeat(value: number): number {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteOptional(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function presetNameForTrack(track: DAWTrack): string {
  const instrument = instrumentForTrack(track.type, track.instrumentId);
  return presetLabel(instrument, track.presetId);
}

function drumLaneSummary(pattern: DrumPattern | undefined): Record<DrumSampleKey, number[]> {
  const normalized = pattern ? normalizeDrumPattern(pattern) : null;
  const lanes = {} as Record<DrumSampleKey, number[]>;
  DRUM_SAMPLE_KEYS.forEach(key => {
    lanes[key] = normalized
      ? normalized.steps[key]
        .map((active, step) => (active ? step : -1))
        .filter(step => step >= 0)
      : [];
  });
  return lanes;
}

export function emptyCopilotEditableArrangementSummary(): CopilotEditableArrangementSummary {
  return {
    selectedTrackId: null,
    selectedBlockId: null,
    selectedMidiBlockId: null,
    playheadBeat: 0,
    tracks: [],
    softwareInstrumentTracks: [],
    midiBlocks: [],
    drumBlocks: [],
    audioBlocks: [],
  };
}

export function buildCopilotEditableArrangementSummary(
  input: CopilotEditableArrangementInput,
): CopilotEditableArrangementSummary {
  const selectedIds = new Set([
    ...input.selectedBlockIds,
    ...(input.selectedBlockId ? [input.selectedBlockId] : []),
  ]);
  const trackById = new Map(input.tracks.map(track => [track.id, track]));
  const blockCounts = input.blocks.reduce<Record<string, number>>((counts, block) => {
    counts[block.trackId] = (counts[block.trackId] ?? 0) + 1;
    return counts;
  }, {});
  const tracks = input.tracks
    .slice(0, MAX_TRACKS)
    .map(track => ({
      id: track.id,
      name: cleanName(track.name, 'Track'),
      type: track.type,
      instrumentId: track.instrumentId,
      presetId: track.presetId,
      presetLabel: presetNameForTrack(track),
      isSelected: track.id === input.selectedTrackId,
      isMuted: track.isMuted === true,
      isSolo: track.isSolo === true,
      isRecordArmed: track.isRecordArmed === true,
      isLocked: track.isLocked === true,
      isFrozen: track.isFrozen === true,
      isArchived: track.isArchived === true,
      isDisabled: track.isDisabled === true,
      routingRole: track.routingRole,
      volumeDb: finiteOptional(track.volumeDb),
      pan: finiteOptional(track.pan),
      blockCount: blockCounts[track.id] ?? 0,
    }));
  const midiBlocks = input.blocks
    .filter(block => block.type === 'midi' && trackById.get(block.trackId)?.type === 'software_instrument')
    .slice(0, MAX_BLOCKS)
    .map(block => {
      const track = trackById.get(block.trackId);
      return {
        id: block.id,
        trackId: block.trackId,
        name: cleanName(block.name, 'MIDI'),
        type: block.type,
        startBeat: finiteBeat(block.startBeat),
        lengthBeats: finiteBeat(block.lengthBeats),
        noteCount: block.notes?.length ?? 0,
        isSelected: selectedIds.has(block.id),
        isLocked: block.isLocked === true,
        trackLocked: track?.isLocked === true,
        trackFrozen: track?.isFrozen === true,
      };
    });
  const drumBlocks = input.blocks
    .filter(block => block.type === 'audio' && Boolean(block.patternId) && trackById.get(block.trackId)?.type === 'drum_machine')
    .slice(0, MAX_BLOCKS)
    .map(block => {
      const track = trackById.get(block.trackId);
      const patternId = block.patternId ?? null;
      return {
        id: block.id,
        trackId: block.trackId,
        name: cleanName(block.name, 'Drums'),
        type: 'audio' as const,
        patternId,
        startBeat: finiteBeat(block.startBeat),
        lengthBeats: finiteBeat(block.lengthBeats),
        lanes: drumLaneSummary(patternId ? input.patterns?.[patternId] : undefined),
        isSelected: selectedIds.has(block.id),
        isLocked: block.isLocked === true,
        trackLocked: track?.isLocked === true,
        trackFrozen: track?.isFrozen === true,
      };
    });
  const audioBlocks = input.blocks
    .filter(block => block.type === 'audio' && !block.patternId)
    .slice(0, MAX_BLOCKS)
    .map(block => {
      const track = trackById.get(block.trackId);
      return {
        id: block.id,
        trackId: block.trackId,
        name: cleanName(block.mediaSourceName ?? block.name, 'Audio'),
        type: 'audio' as const,
        startBeat: finiteBeat(block.startBeat),
        lengthBeats: finiteBeat(block.lengthBeats),
        sourceOffsetBeats: finiteOptional(block.sourceOffsetBeats),
        sourceLengthBeats: finiteOptional(block.sourceLengthBeats),
        durationSeconds: finiteOptional(block.durationSeconds),
        hasWaveformPeaks: (block.waveformPeaks?.length ?? 0) > 0,
        hasSpectrogramPng: typeof block.spectrogramPngPath === 'string' && block.spectrogramPngPath.length > 0,
        spectrogramStatus: block.spectrogramPngPath
          ? 'available' as const
          : block.spectrogramRequestId
            ? 'pending' as const
            : block.spectrogramError
              ? 'error' as const
              : 'none' as const,
        isMissingMedia: block.isMissingMedia === true,
        isSelected: selectedIds.has(block.id),
        isLocked: block.isLocked === true,
        trackLocked: track?.isLocked === true,
        trackFrozen: track?.isFrozen === true,
      };
    });
  const selectedMidiBlock = input.selectedBlockId
    ? midiBlocks.find(block => block.id === input.selectedBlockId)
    : null;

  return {
    selectedTrackId: input.selectedTrackId,
    selectedBlockId: input.selectedBlockId,
    selectedMidiBlockId: selectedMidiBlock?.id ?? null,
    playheadBeat: finiteBeat(input.playheadBeat),
    tracks,
    softwareInstrumentTracks: tracks.filter(track => track.type === 'software_instrument'),
    midiBlocks,
    drumBlocks,
    audioBlocks,
  };
}
