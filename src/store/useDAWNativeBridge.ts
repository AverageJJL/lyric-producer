import {useEffect, useRef} from 'react';

import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import {audioPathIsPlaybackReady} from '../native/audioPlaybackPreparation';
import {
  nativeBlockFingerprint,
  shouldSyncFileAudioClip,
  upsertBlockToEngineAsync,
} from '../native/blockSync';
import {buildNativeMasterMixPayload} from '../native/masterMixPayload';
import {buildNativeTracksPayload} from '../native/trackPayload';
import {
  applyTransportStatusFromResponse,
  buildNativeTransportPayload,
  type NativeTransportPayload,
} from '../native/transportPayload';
import {buildNativeLoopRangePayload} from '../native/loopRangePayload';
import {buildNativeTempoMapPayload} from '../native/tempoMapPayload';
import {syncTrackInstruments} from '../native/syncTrackInstruments';
import {activeTracks, playableTrackIds, playableTracks} from '../music/trackOrganization';
import {suppressNativeBridgeSync} from './dawRecording';
import type {DAWBlock, DAWTrack} from './useDAWStore';
import {useDAWStore} from './useDAWStore';

const BLOCK_UPSERT_DEBOUNCE_MS = 200;
const TRACK_MAPPING_DEBOUNCE_MS = 40;
// Opening a saved project can make many clips dirty at once. File-backed audio
// upserts are async, but the native engine still serializes media work; yielding
// between clips keeps playback prep cooperative instead of one large burst.
const BLOCK_UPSERT_CHUNK_DELAY_MS = 16;
const BLOCK_UPSERT_CHUNK_SIZE = 1;

let upsertTimer: ReturnType<typeof setTimeout> | null = null;
let trackMappingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingTrackMappingTracks: DAWTrack[] | null = null;
const pendingTrackMappingCallbacks: Array<() => void> = [];
const blockFingerprints = new Map<string, string>();
let pendingProjectRestoreBlockSyncDeferral = 0;
const projectRestoreDeferredAudioBlockIds = new Set<string>();
let transportStartRequestId = 0;

function clearPendingUpserts(): void {
  if (!upsertTimer) {
    return;
  }
  clearTimeout(upsertTimer);
  upsertTimer = null;
}

function clearPendingTrackMappingTimer(): void {
  if (!trackMappingTimer) {
    return;
  }
  clearTimeout(trackMappingTimer);
  trackMappingTimer = null;
}

export function deferNextNativeBlockSyncForProjectOpen(): () => void {
  const token = pendingProjectRestoreBlockSyncDeferral + 1;
  pendingProjectRestoreBlockSyncDeferral = token;
  return () => {
    if (pendingProjectRestoreBlockSyncDeferral === token) {
      pendingProjectRestoreBlockSyncDeferral = 0;
    }
  };
}

function consumeProjectRestoreBlockSyncDeferral(): boolean {
  if (pendingProjectRestoreBlockSyncDeferral === 0) {
    return false;
  }
  pendingProjectRestoreBlockSyncDeferral = 0;
  clearPendingUpserts();
  return true;
}

function blockShouldDeferAfterProjectOpen(block: DAWBlock): boolean {
  return shouldSyncFileAudioClip(block) &&
    !audioPathIsPlaybackReady(block.audioFilePath) &&
    !audioPathIsPlaybackReady(block.absoluteAudioFilePath);
}

function deferProjectOpenBlock(block: DAWBlock): void {
  blockFingerprints.delete(block.id);
  if (blockShouldDeferAfterProjectOpen(block)) {
    projectRestoreDeferredAudioBlockIds.add(block.id);
  } else {
    projectRestoreDeferredAudioBlockIds.delete(block.id);
  }
}

function deferredProjectOpenBlockIds(blocks: DAWBlock[]): Set<string> {
  const ids = new Set<string>();
  blocks.forEach(block => {
    if (projectRestoreDeferredAudioBlockIds.has(block.id)) {
      ids.add(block.id);
    }
  });
  return ids;
}

function scheduleDeferredProjectOpenUpserts(blockIds: Set<string>): void {
  if (blockIds.size === 0) {
    return;
  }
  const {blocks} = useDAWStore.getState();
  const readyIds = new Set<string>();
  blockIds.forEach(blockId => {
    const block = blocks.find(item => item.id === blockId);
    if (!block || blockShouldDeferAfterProjectOpen(block)) {
      return;
    }
    projectRestoreDeferredAudioBlockIds.delete(blockId);
    readyIds.add(blockId);
  });
  scheduleUpserts(readyIds);
}

function syncRecordArm(tracks: DAWTrack[]): void {
  tracks.forEach(track => {
    sendNativeAudioCommand('set_record_arm', {
      trackId: track.id,
      armed: track.isRecordArmed,
    });
  });
}

function syncMasterMix(volumeDb: number, pan: number): void {
  sendNativeAudioCommand(
    'set_master_mix',
    buildNativeMasterMixPayload({masterVolumeDb: volumeDb, masterPan: pan}),
  );
}

function syncTrackMapping(tracks: DAWTrack[]): void {
  const nextActiveTracks = activeTracks(tracks);
  sendNativeAudioCommand('setTracks', {
    tracks: buildNativeTracksPayload(tracks),
  });
  syncTrackInstruments(tracks);
  syncRecordArm(nextActiveTracks);
}

function flushScheduledTrackMapping(): void {
  if (!pendingTrackMappingTracks) {
    clearPendingTrackMappingTimer();
    return;
  }

  const tracks = pendingTrackMappingTracks;
  const callbacks = pendingTrackMappingCallbacks.splice(0);
  pendingTrackMappingTracks = null;
  clearPendingTrackMappingTimer();

  syncTrackMapping(tracks);
  callbacks.forEach(callback => callback());
}

function scheduleTrackMapping(tracks: DAWTrack[], afterFlush?: () => void): void {
  pendingTrackMappingTracks = tracks;
  pendingTrackMappingCallbacks.length = 0;
  if (afterFlush) {
    pendingTrackMappingCallbacks.push(afterFlush);
  }
  clearPendingTrackMappingTimer();
  trackMappingTimer = setTimeout(flushScheduledTrackMapping, TRACK_MAPPING_DEBOUNCE_MS);
}

function syncTrackMappingBeforePlayback(tracks: DAWTrack[]): void {
  if (pendingTrackMappingTracks) {
    pendingTrackMappingTracks = tracks;
    flushScheduledTrackMapping();
    return;
  }
  syncTrackMapping(tracks);
}

function playableTrackOrder(tracks: DAWTrack[]): string[] {
  return playableTracks(tracks).map(track => track.id);
}

function trackOrderIsDifferent(previousTracks: DAWTrack[], nextTracks: DAWTrack[]): boolean {
  const previousOrder = playableTrackOrder(previousTracks);
  const nextOrder = playableTrackOrder(nextTracks);

  return previousOrder.some((trackId, index) => trackId !== nextOrder[index]);
}

function syncLoopRange(state = useDAWStore.getState()): void {
  sendNativeAudioCommand('set_loop_range', buildNativeLoopRangePayload(state));
}

function syncTempoMap(state = useDAWStore.getState()): void {
  sendNativeAudioCommand('set_tempo_map', buildNativeTempoMapPayload(state));
}

function markBlockSynced(block: DAWBlock): void {
  blockFingerprints.set(block.id, nativeBlockFingerprint(block));
  projectRestoreDeferredAudioBlockIds.delete(block.id);
}

function ensureArrangementSynced(blocks: DAWBlock[], state = useDAWStore.getState()): void {
  syncTempoMap(state);
  blocks.forEach(block => {
    const fingerprint = nativeBlockFingerprint(block);
    if (blockFingerprints.get(block.id) === fingerprint) {
      return;
    }
    upsertBlockToEngineAsync(block);
    markBlockSynced(block);
  });
  syncLoopRange(state);
}

function deleteBlockImmediate(block: DAWBlock): void {
  sendNativeAudioCommand('delete_clip', {clipId: block.id});
  blockFingerprints.delete(block.id);
}

function flushScheduledUpserts(dirtyIds: Set<string>): void {
  const {blocks} = useDAWStore.getState();
  let processed = 0;
  while (processed < BLOCK_UPSERT_CHUNK_SIZE && dirtyIds.size > 0) {
    const blockId = dirtyIds.values().next().value as string | undefined;
    if (!blockId) {
      break;
    }
    dirtyIds.delete(blockId);
    processed += 1;

    const block = blocks.find(item => item.id === blockId);
    if (!block) {
      blockFingerprints.delete(blockId);
      continue;
    }

    const fingerprint = nativeBlockFingerprint(block);
    if (blockFingerprints.get(blockId) === fingerprint) {
      continue;
    }

    upsertBlockToEngineAsync(block);
    markBlockSynced(block);
  }

  if (dirtyIds.size > 0) {
    upsertTimer = setTimeout(
      () => flushScheduledUpserts(dirtyIds),
      BLOCK_UPSERT_CHUNK_DELAY_MS,
    );
    return;
  }

  upsertTimer = null;
  syncLoopRange();
}

function scheduleUpserts(dirtyIds: Set<string>): void {
  if (dirtyIds.size === 0) {
    return;
  }

  if (upsertTimer) {
    clearPendingUpserts();
  }

  upsertTimer = setTimeout(
    () => flushScheduledUpserts(new Set(dirtyIds)),
    BLOCK_UPSERT_DEBOUNCE_MS,
  );
}

/** Growing recording clip stays in JS only — native upsert rebuilds the whole clip and stalls live MIDI. */
function excludeRecordingBlockFromDirty(
  dirtyIds: Set<string>,
  isRecording: boolean,
  recordingBlockId: string | null,
): Set<string> {
  if (!isRecording || !recordingBlockId || !dirtyIds.has(recordingBlockId)) {
    return dirtyIds;
  }

  const filtered = new Set(dirtyIds);
  filtered.delete(recordingBlockId);
  return filtered;
}

function upsertBlockImmediate(block: DAWBlock): void {
  upsertBlockToEngineAsync(block);
  markBlockSynced(block);
}

function recordingTakeGroupForTakeId(blocks: DAWBlock[], takeId: string | null): string | null {
  if (!takeId) {
    return null;
  }
  return blocks.find(block => block.recordingTakeId === takeId || block.id === takeId)
    ?.recordingTakeGroupId ?? null;
}

function transportResponseFailed(response: string | null): boolean {
  return response?.includes('"ok":false') === true;
}

function transportResponseOk(response: string | null): boolean {
  return response != null && !transportResponseFailed(response);
}

async function sendTransportStartAsync(
  payload: NativeTransportPayload,
  deferredPlayBlockIds: Set<string>,
): Promise<void> {
  const requestId = ++transportStartRequestId;
  let response = await sendNativeAudioCommandAsync('transport_play', payload);
  if (requestId !== transportStartRequestId || !useDAWStore.getState().isPlaying) {
    return;
  }
  applyTransportStatusFromResponse(response, true);

  if (transportResponseFailed(response)) {
    response = await sendNativeAudioCommandAsync('transport_play', {
      ...payload,
      isPlaying: true,
    });
    if (requestId !== transportStartRequestId || !useDAWStore.getState().isPlaying) {
      return;
    }
    applyTransportStatusFromResponse(response, true);
  }

  if (transportResponseOk(response)) {
    scheduleDeferredProjectOpenUpserts(deferredPlayBlockIds);
  }
}

export function upsertRecordingCompGroup(blocks: DAWBlock[], groupId: string | null): void {
  if (!groupId) {
    return;
  }
  blocks
    .filter(block => block.recordingTakeGroupId === groupId || block.recordingCompGroupId === groupId)
    .forEach(upsertBlockImmediate);
  syncLoopRange();
}

function findDirtyBlockIds(previous: DAWBlock[], next: DAWBlock[]): Set<string> {
  const dirty = new Set<string>();
  const previousById = new Map(previous.map(block => [block.id, block]));

  next.forEach(block => {
    const prev = previousById.get(block.id);
    if (!prev || nativeBlockFingerprint(prev) !== nativeBlockFingerprint(block)) {
      dirty.add(block.id);
    }
  });

  return dirty;
}

export function useDAWNativeBridge(): void {
  const previousBlocksRef = useRef<DAWBlock[]>(useDAWStore.getState().blocks);

  useEffect(() => {
    const unsubscribe = useDAWStore.subscribe((nextState, prevState) => {
      const deferProjectRestoreBlockSync = consumeProjectRestoreBlockSyncDeferral();
      const blocksChangedFromEngine =
        nextState.syncSource === 'engine' &&
        nextState.blocks !== prevState.blocks &&
        nextState.isRecording;

      if (nextState.syncSource === 'engine' && !blocksChangedFromEngine) {
        return;
      }

      if (!prevState.isRecording && nextState.isRecording && upsertTimer) {
        clearPendingUpserts();
      }

      if (nextState.isPlaying !== prevState.isPlaying && !suppressNativeBridgeSync) {
        let deferredPlayBlockIds = new Set<string>();
        if (nextState.isPlaying) {
          sendNativeAudioCommand('stop_pattern_preview', {});
          sendNativeAudioCommand('midi_all_notes_off', {});
          syncTrackMappingBeforePlayback(nextState.tracks);
          syncMasterMix(nextState.masterVolumeDb, nextState.masterPan);
          const blocksToSync =
            nextState.isRecording && nextState.recordingBlockId
              ? nextState.blocks.filter(block => block.id !== nextState.recordingBlockId)
              : nextState.blocks;
          deferredPlayBlockIds = deferredProjectOpenBlockIds(blocksToSync);
          ensureArrangementSynced(
            blocksToSync.filter(block => !deferredPlayBlockIds.has(block.id)),
            nextState,
          );
          sendNativeAudioCommand('set_bpm', {bpm: nextState.bpm});
          sendNativeAudioCommand('set_click_track', {enabled: nextState.isMetronomeEnabled});
        }
        // transport_play sets position and runs ensureAudioDeviceReady — set_transport_position
        // only transport.stop() and breaks output after refresh_audio_device.
        const transportPayload = buildNativeTransportPayload(
          nextState.isPlaying,
          nextState.playheadBeat,
          nextState.playheadSeconds,
        );
        if (nextState.isPlaying) {
          void sendTransportStartAsync(transportPayload, deferredPlayBlockIds);
        } else {
          const requestId = ++transportStartRequestId;
          void sendNativeAudioCommandAsync('transport_play', transportPayload).then(response => {
            if (requestId === transportStartRequestId && !useDAWStore.getState().isPlaying) {
              applyTransportStatusFromResponse(response, false);
            }
          });
        }
      }

      if (nextState.bpm !== prevState.bpm) {
        sendNativeAudioCommand('set_bpm', {bpm: nextState.bpm});
        syncTempoMap(nextState);
      }

      if (nextState.isMetronomeEnabled !== prevState.isMetronomeEnabled) {
        sendNativeAudioCommand('set_click_track', {enabled: nextState.isMetronomeEnabled});
      }

      if (
        nextState.masterVolumeDb !== prevState.masterVolumeDb ||
        nextState.masterPan !== prevState.masterPan
      ) {
        syncMasterMix(nextState.masterVolumeDb, nextState.masterPan);
      }

      if (nextState.auditionedRecordingTakeId !== prevState.auditionedRecordingTakeId) {
        const prevGroupId = recordingTakeGroupForTakeId(
          prevState.blocks,
          prevState.auditionedRecordingTakeId,
        );
        const nextGroupId = recordingTakeGroupForTakeId(
          nextState.blocks,
          nextState.auditionedRecordingTakeId,
        );
        upsertRecordingCompGroup(nextState.blocks, prevGroupId);
        if (nextGroupId !== prevGroupId) {
          upsertRecordingCompGroup(nextState.blocks, nextGroupId);
        }
      }

      if (nextState.tracks !== prevState.tracks) {
        const prevPlayableIds = playableTrackIds(prevState.tracks);
        const nextPlayableIds = playableTrackIds(nextState.tracks);
        const playableOrderChanged = trackOrderIsDifferent(prevState.tracks, nextState.tracks);
        const newlyDisabledIds = [...prevPlayableIds].filter(trackId => !nextPlayableIds.has(trackId));
        const newlyEnabledIds = [...nextPlayableIds].filter(trackId => !prevPlayableIds.has(trackId));

        if (deferProjectRestoreBlockSync) {
          scheduleTrackMapping(nextState.tracks);
          nextState.blocks.forEach(deferProjectOpenBlock);
        } else {
          nextState.blocks
            .filter(block => newlyDisabledIds.includes(block.trackId))
            .forEach(deleteBlockImmediate);
          scheduleTrackMapping(nextState.tracks, () => {
            if (playableOrderChanged) {
              nextState.blocks
                .filter(block => nextPlayableIds.has(block.trackId))
                .forEach(upsertBlockImmediate);
            } else {
              nextState.blocks
                .filter(block => newlyEnabledIds.includes(block.trackId))
                .forEach(upsertBlockImmediate);
            }
          });
        }
      }

      if (nextState.blocks !== prevState.blocks) {
        if (suppressNativeBridgeSync) {
          previousBlocksRef.current = nextState.blocks;
          return;
        }

        const removedBlocks = previousBlocksRef.current.filter(
          previousBlock => !nextState.blocks.some(block => block.id === previousBlock.id),
        );

        removedBlocks.forEach(deleteBlockImmediate);

        let dirtyIds = findDirtyBlockIds(previousBlocksRef.current, nextState.blocks);
        dirtyIds = excludeRecordingBlockFromDirty(
          dirtyIds,
          nextState.isRecording,
          nextState.recordingBlockId,
        );

        const recordingJustFinalized =
          !nextState.isRecording &&
          prevState.recordingBlockId !== null &&
          nextState.recordingBlockId === null;

        if (recordingJustFinalized) {
          const finalizedBlock = nextState.blocks.find(
            block => block.id === prevState.recordingBlockId,
          );
          if (finalizedBlock) {
            upsertBlockImmediate(finalizedBlock);
            dirtyIds.delete(finalizedBlock.id);
            syncLoopRange(nextState);
          }
        }

        if (deferProjectRestoreBlockSync) {
          const immediateDirtyIds = new Set<string>();
          dirtyIds.forEach(blockId => {
            const block = nextState.blocks.find(item => item.id === blockId);
            if (!block) {
              blockFingerprints.delete(blockId);
              projectRestoreDeferredAudioBlockIds.delete(blockId);
              return;
            }
            if (blockShouldDeferAfterProjectOpen(block)) {
              deferProjectOpenBlock(block);
            } else {
              immediateDirtyIds.add(blockId);
            }
          });
          if (immediateDirtyIds.size > 0) {
            scheduleUpserts(immediateDirtyIds);
          }
          if (removedBlocks.length > 0) {
            syncLoopRange(nextState);
          }
        } else if (dirtyIds.size > 0) {
          scheduleUpserts(dirtyIds);
        } else if (removedBlocks.length > 0 || recordingJustFinalized) {
          syncLoopRange(nextState);
        }

        previousBlocksRef.current = nextState.blocks;
      }

      if (
        nextState.performanceMode !== prevState.performanceMode ||
        nextState.looperLengthBars !== prevState.looperLengthBars ||
        nextState.timeSignature.numerator !== prevState.timeSignature.numerator ||
        nextState.timeSignature.denominator !== prevState.timeSignature.denominator ||
        nextState.tempoMap !== prevState.tempoMap ||
        nextState.meterMap !== prevState.meterMap ||
        nextState.isCycleEnabled !== prevState.isCycleEnabled ||
        nextState.cycleStartBeat !== prevState.cycleStartBeat ||
        nextState.cycleEndBeat !== prevState.cycleEndBeat
      ) {
        if (
          nextState.timeSignature.numerator !== prevState.timeSignature.numerator ||
          nextState.timeSignature.denominator !== prevState.timeSignature.denominator ||
          nextState.tempoMap !== prevState.tempoMap ||
          nextState.meterMap !== prevState.meterMap
        ) {
          syncTempoMap(nextState);
        }
        syncLoopRange(nextState);
      }
    });

    return () => {
      unsubscribe();
      clearPendingTrackMappingTimer();
      pendingTrackMappingTracks = null;
      pendingTrackMappingCallbacks.length = 0;
    };
  }, []);
}
