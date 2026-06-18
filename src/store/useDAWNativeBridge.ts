import {useEffect, useRef} from 'react';

import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {nativeBlockFingerprint, upsertBlockToEngine} from '../native/blockSync';
import {buildNativeMasterMixPayload} from '../native/masterMixPayload';
import {buildNativeTracksPayload} from '../native/trackPayload';
import {
  applyTransportStatusFromResponse,
  buildNativeTransportPayload,
} from '../native/transportPayload';
import {buildNativeLoopRangePayload} from '../native/loopRangePayload';
import {buildNativeTempoMapPayload} from '../native/tempoMapPayload';
import {syncTrackInstruments} from '../native/syncTrackInstruments';
import {activeTracks, playableTrackIds, playableTracks} from '../music/trackOrganization';
import {suppressNativeBridgeSync} from './dawRecording';
import type {DAWBlock, DAWTrack} from './useDAWStore';
import {useDAWStore} from './useDAWStore';

const BLOCK_UPSERT_DEBOUNCE_MS = 200;

let upsertTimer: ReturnType<typeof setTimeout> | null = null;
const blockFingerprints = new Map<string, string>();

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

function playableTrackOrder(tracks: DAWTrack[]): string[] {
  return playableTracks(tracks).map(track => track.id);
}

function trackOrderIsDifferent(previousTracks: DAWTrack[], nextTracks: DAWTrack[]): boolean {
  const previousOrder = playableTrackOrder(previousTracks);
  const nextOrder = playableTrackOrder(nextTracks);

  return previousOrder.length !== nextOrder.length ||
    previousOrder.some((trackId, index) => trackId !== nextOrder[index]);
}

function syncLoopRange(state = useDAWStore.getState()): void {
  sendNativeAudioCommand('set_loop_range', buildNativeLoopRangePayload(state));
}

function syncTempoMap(state = useDAWStore.getState()): void {
  sendNativeAudioCommand('set_tempo_map', buildNativeTempoMapPayload(state));
}

function ensureArrangementSynced(blocks: DAWBlock[], state = useDAWStore.getState()): void {
  syncTempoMap(state);
  blocks.forEach(block => {
    const fingerprint = nativeBlockFingerprint(block);
    if (blockFingerprints.get(block.id) === fingerprint) {
      return;
    }
    upsertBlockToEngine(block);
    blockFingerprints.set(block.id, fingerprint);
  });
  syncLoopRange(state);
}

function deleteBlockImmediate(block: DAWBlock): void {
  sendNativeAudioCommand('delete_clip', {clipId: block.id});
  blockFingerprints.delete(block.id);
}

function scheduleUpserts(blocks: DAWBlock[], dirtyIds: Set<string>): void {
  if (dirtyIds.size === 0) {
    return;
  }

  if (upsertTimer) {
    clearTimeout(upsertTimer);
  }

  upsertTimer = setTimeout(() => {
    dirtyIds.forEach(blockId => {
      const block = blocks.find(item => item.id === blockId);
      if (!block) {
        return;
      }

      const fingerprint = nativeBlockFingerprint(block);
      if (blockFingerprints.get(blockId) === fingerprint) {
        return;
      }

      upsertBlockToEngine(block);
      blockFingerprints.set(blockId, fingerprint);
    });
    syncLoopRange();
  }, BLOCK_UPSERT_DEBOUNCE_MS);
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
  upsertBlockToEngine(block);
  blockFingerprints.set(block.id, nativeBlockFingerprint(block));
}

function recordingTakeGroupForTakeId(blocks: DAWBlock[], takeId: string | null): string | null {
  if (!takeId) {
    return null;
  }
  return blocks.find(block => block.recordingTakeId === takeId || block.id === takeId)
    ?.recordingTakeGroupId ?? null;
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
  const previousBlocksRef = useRef<DAWBlock[]>([]);

  useEffect(() => {
    const unsubscribe = useDAWStore.subscribe((nextState, prevState) => {
      const blocksChangedFromEngine =
        nextState.syncSource === 'engine' &&
        nextState.blocks !== prevState.blocks &&
        nextState.isRecording;

      if (nextState.syncSource === 'engine' && !blocksChangedFromEngine) {
        return;
      }

      if (!prevState.isRecording && nextState.isRecording && upsertTimer) {
        clearTimeout(upsertTimer);
        upsertTimer = null;
      }

      if (nextState.isPlaying !== prevState.isPlaying && !suppressNativeBridgeSync) {
        if (nextState.isPlaying) {
          sendNativeAudioCommand('stop_pattern_preview', {});
          sendNativeAudioCommand('midi_all_notes_off', {});
          syncTrackMapping(nextState.tracks);
          syncMasterMix(nextState.masterVolumeDb, nextState.masterPan);
          const blocksToSync =
            nextState.isRecording && nextState.recordingBlockId
              ? nextState.blocks.filter(block => block.id !== nextState.recordingBlockId)
              : nextState.blocks;
          ensureArrangementSynced(blocksToSync, nextState);
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
        const transportResponse = sendNativeAudioCommand('transport_play', transportPayload);
        applyTransportStatusFromResponse(transportResponse, nextState.isPlaying);
        if (nextState.isPlaying && transportResponse?.includes('"ok":false')) {
          const retryResponse = sendNativeAudioCommand('transport_play', {
            ...transportPayload,
            isPlaying: true,
          });
          applyTransportStatusFromResponse(retryResponse, true);
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
        syncTrackMapping(nextState.tracks);

        const prevPlayableIds = playableTrackIds(prevState.tracks);
        const nextPlayableIds = playableTrackIds(nextState.tracks);
        const playableOrderChanged = trackOrderIsDifferent(prevState.tracks, nextState.tracks);
        const newlyDisabledIds = [...prevPlayableIds].filter(trackId => !nextPlayableIds.has(trackId));
        const newlyEnabledIds = [...nextPlayableIds].filter(trackId => !prevPlayableIds.has(trackId));

        nextState.blocks
          .filter(block => newlyDisabledIds.includes(block.trackId))
          .forEach(deleteBlockImmediate);
        if (playableOrderChanged) {
          nextState.blocks
            .filter(block => nextPlayableIds.has(block.trackId))
            .forEach(upsertBlockImmediate);
        } else {
          nextState.blocks
            .filter(block => newlyEnabledIds.includes(block.trackId))
            .forEach(upsertBlockImmediate);
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

        if (dirtyIds.size > 0) {
          scheduleUpserts(nextState.blocks, dirtyIds);
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

    return unsubscribe;
  }, []);
}
