import {isDrumPatternBlock} from '../music/clipFactories';
import {trackIsPlayable} from '../music/trackOrganization';
import {patternStepsPayload} from '../music/drumPatterns';
import type {DrumSampleKey} from '../assets/drumKit';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {recordingTakeIsActive} from '../transport/recordingTakes';
import {sendNativeAudioCommand} from './NativeAudioEngine';

function blockIsMutedForPlayback(block: DAWBlock): boolean {
  const state = useDAWStore.getState();
  const auditionedTake = state.auditionedRecordingTakeId
    ? state.blocks.find(item =>
        item.recordingTakeId === state.auditionedRecordingTakeId ||
        item.id === state.auditionedRecordingTakeId,
      )
    : null;
  if (auditionedTake?.recordingTakeGroupId) {
    if (block.recordingCompGroupId === auditionedTake.recordingTakeGroupId) {
      return true;
    }
    if (
      block.recordingTakeGroupId === auditionedTake.recordingTakeGroupId &&
      (block.recordingTakeId ?? block.id) === (auditionedTake.recordingTakeId ?? auditionedTake.id)
    ) {
      return block.isMuted === true;
    }
  }
  return block.isMuted === true ||
    (Boolean(block.recordingTakeGroupId) && !recordingTakeIsActive(block));
}

export function nativeBlockFingerprint(block: DAWBlock): string {
  const pattern =
    block.patternId != null
      ? useDAWStore.getState().patterns[block.patternId]
      : undefined;
  return JSON.stringify({
    trackId: block.trackId,
    startBeat: block.startBeat,
    lengthBeats: block.lengthBeats,
    name: block.name,
    notes: block.notes ?? [],
    patternId: block.patternId,
    lanes: pattern ? patternStepsPayload(pattern) : undefined,
    sourceLengthBeats: block.sourceLengthBeats,
    sourceOffsetBeats: block.sourceOffsetBeats,
    isMuted: blockIsMutedForPlayback(block),
    recordingTakeActive: block.recordingTakeActive,
    clipGainDb: block.clipGainDb ?? 0,
    fadeInBeats: block.fadeInBeats ?? 0,
    fadeOutBeats: block.fadeOutBeats ?? 0,
    isReversed: block.isReversed ?? false,
    audioFilePath: block.audioFilePath,
    absoluteAudioFilePath: block.absoluteAudioFilePath,
    durationSeconds: block.durationSeconds,
  });
}

export function shouldSyncFileAudioClip(block: DAWBlock): boolean {
  const tracks = useDAWStore.getState().tracks;
  return block.type === 'audio'
    && Boolean(block.audioFilePath)
    && !isDrumPatternBlock(block)
    && trackIsPlayable(tracks, block.trackId);
}

function shouldRemoveNativeAudioClip(block: DAWBlock): boolean {
  return block.type === 'audio'
    && !isDrumPatternBlock(block)
    && Boolean(block.isMissingMedia);
}

export function upsertBlockToEngine(block: DAWBlock): void {
  if (!trackIsPlayable(useDAWStore.getState().tracks, block.trackId)) {
    sendNativeAudioCommand('delete_clip', {clipId: block.id});
    return;
  }

  if (blockIsMutedForPlayback(block)) {
    sendNativeAudioCommand('delete_clip', {clipId: block.id});
    return;
  }

  if (block.type === 'midi') {
    sendNativeAudioCommand('upsert_midi_clip', {
      clipId: block.id,
      trackId: block.trackId,
      startBeat: block.startBeat,
      lengthBeats: block.lengthBeats,
      name: block.name,
      notes: block.notes ?? [],
    });
    return;
  }

  if (shouldRemoveNativeAudioClip(block)) {
    sendNativeAudioCommand('delete_clip', {clipId: block.id});
    return;
  }

  const payload: Record<string, unknown> = {
    clipId: block.id,
    trackId: block.trackId,
    startBeat: block.startBeat,
    lengthBeats: block.lengthBeats,
    name: block.name,
    sourceOffsetBeats: block.sourceOffsetBeats ?? 0,
    sourceLengthBeats: block.sourceLengthBeats ?? block.lengthBeats,
    clipGainDb: block.clipGainDb ?? 0,
    fadeInBeats: block.fadeInBeats ?? 0,
    fadeOutBeats: block.fadeOutBeats ?? 0,
    isReversed: block.isReversed ?? false,
  };

  if (isDrumPatternBlock(block) && block.patternId) {
    const pattern = useDAWStore.getState().patterns[block.patternId];
    if (pattern) {
      payload.lanes = patternStepsPayload(pattern);
    }
  }

  if (shouldSyncFileAudioClip(block)) {
    payload.audioFilePath = block.audioFilePath;
    if (block.absoluteAudioFilePath) {
      payload.absoluteAudioFilePath = block.absoluteAudioFilePath;
    }
  }

  sendNativeAudioCommand('upsert_audio_clip', payload);
}

export function setDrumPatternStepOnEngine(
  block: DAWBlock,
  sampleKey: DrumSampleKey,
  step: number,
  active: boolean,
): void {
  if (
    !isDrumPatternBlock(block)
    || block.patternId == null
    || blockIsMutedForPlayback(block)
    || !trackIsPlayable(useDAWStore.getState().tracks, block.trackId)
  ) {
    return;
  }

  const payload = {
    clipId: block.id,
    trackId: block.trackId,
    startBeat: block.startBeat,
    lengthBeats: block.lengthBeats,
    patternId: block.patternId,
    sampleKey,
    step,
    active,
  };
  sendNativeAudioCommand('set_drum_pattern_step', payload);
}
