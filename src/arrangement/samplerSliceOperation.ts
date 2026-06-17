import {createTrackFromTemplate} from '../music/trackTemplates';
import {
  buildSamplerSlicesFromAudioBlock,
  SAMPLER_SLICES_INSTRUMENT_ID,
  SAMPLER_SLICES_PRESET_ID,
  type SamplerSliceIntent,
} from '../music/samplerSlicing';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {normalizeMidiClip} from '../music/midiClipNormalization';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';

export type CreateSamplerFromSlicesOperation = {
  op: 'createSamplerFromSlices';
  sourceClipId: string;
  trackId: string;
  trackName: string;
  clipId: string;
  clipName: string;
  startBeat: number;
  slices: SamplerSliceIntent[];
};

function samplerTrackFromOperation(
  operation: CreateSamplerFromSlicesOperation,
  laneIndex: number,
  existing: DAWTrack | undefined,
  regions: DAWTrack['samplerRegions'],
): DAWTrack {
  if (existing) {
    return {
      ...existing,
      name: operation.trackName,
      type: 'software_instrument',
      instrumentId: SAMPLER_SLICES_INSTRUMENT_ID,
      presetId: SAMPLER_SLICES_PRESET_ID,
      samplerRegions: regions?.map(region => ({...region})),
    };
  }
  return createTrackFromTemplate('virtual_instrument', laneIndex, {
    id: operation.trackId,
    name: operation.trackName,
    instrumentId: SAMPLER_SLICES_INSTRUMENT_ID,
    presetId: SAMPLER_SLICES_PRESET_ID,
    samplerRegions: regions,
  });
}

function midiBlockFromSlices(
  operation: CreateSamplerFromSlicesOperation,
  trackId: string,
  notes: DAWBlock['notes'],
  bpm: number,
): DAWBlock {
  const normalized = normalizeMidiClip(notes ?? [], {
    bpm,
    requestedLengthBeats: Math.max(
      1,
      ...(notes ?? []).map(note => note.startBeat + note.lengthBeats),
    ),
  });
  return {
    id: operation.clipId,
    trackId,
    name: operation.clipName,
    startBeat: Math.max(0, operation.startBeat),
    lengthBeats: normalized.lengthBeats,
    type: 'midi',
    color: '#7a5cff',
    notes: normalized.notes,
  };
}

export function applySamplerSliceOperation(
  operation: CreateSamplerFromSlicesOperation,
): boolean {
  const state = useDAWStore.getState();
  const sourceBlock = state.blocks.find(block => block.id === operation.sourceClipId);
  if (!sourceBlock) {
    return false;
  }
  const build = buildSamplerSlicesFromAudioBlock(sourceBlock, state.bpm, operation.slices);
  if (!build) {
    return false;
  }

  const existingTrack = state.tracks.find(track => track.id === operation.trackId);
  const nextTrack = samplerTrackFromOperation(
    operation,
    state.tracks.length,
    existingTrack,
    build.regions,
  );
  const block = midiBlockFromSlices(operation, nextTrack.id, build.notes, state.bpm);
  const nextTracks = [
    ...state.tracks.filter(track => track.id !== nextTrack.id),
    nextTrack,
  ];
  const nextBlocks = [
    ...state.blocks.filter(item => item.id !== block.id),
    block,
  ];

  if (
    JSON.stringify(state.tracks) !== JSON.stringify(nextTracks) ||
    JSON.stringify(state.blocks) !== JSON.stringify(nextBlocks)
  ) {
    recordArrangementHistory(captureArrangementHistorySnapshot(state));
  }

  useDAWStore.setState({
    tracks: nextTracks,
    blocks: nextBlocks,
    selectedTrackId: nextTrack.id,
    selectedBlockId: block.id,
    selectedBlockIds: [block.id],
    syncSource: 'ui',
  });
  return true;
}
