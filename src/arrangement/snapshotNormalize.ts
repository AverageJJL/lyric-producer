import type {ProjectSnapshot} from './projectSnapshot';
import {mediaReferencesFromBlocks} from './mediaReferences';
import {
  emptyTrackFxState,
  summarizeTrackFx,
  withNormalizedPluginChain,
  type TrackFxState,
} from '../native/fxContract';
import {emptyTrackAmpSimState} from '../native/ampSimContract';
import {normalizeSnapGrid} from '../ui/snapGrid';
import {normalizeCycleRange} from '../transport/cycleRange';
import {
  normalizeLooperLengthBars,
  normalizePerformanceMode,
} from '../transport/performanceMode';
import {
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingCountInBeats,
  normalizeRecordingPreRollBeats,
} from '../transport/recordingPreferences';
import {
  normalizeMeterMap,
  normalizeTempoBpm,
  normalizeTempoMap,
} from '../transport/tempoMap';
import {normalizeTrackOrganizationLabel, storedTrackHeightScale} from '../music/trackOrganization';
import {storedTrackRoutingRole} from '../music/trackRouting';
import {normalizeTimeSignature} from '../store/projectMetadata';
import {
  emptyCopilotChatProjectState,
  normalizeCopilotChatProjectState,
} from '../assistant/copilotChatHistory';

/**
 * Snapshot normalization extracted from the (now-removed) `.apcproject` document
 * layer into a permanent home.
 *
 * Why this module exists on its own: `normalizeSnapshot` is the single function
 * that makes a deserialized snapshot byte-identical to one produced by
 * `captureProjectSnapshot()`. Both the project-open path and the `.apc` source
 * compiler MUST run their output through it so that
 * `snapshotFingerprint(compile(decompose(S)))` equals `snapshotFingerprint(S)`.
 * Keeping it here (rather than inside a file-format module that comes and goes)
 * guarantees there is exactly one normalizer for the whole app.
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function hasSnapshotShape(value: unknown): value is ProjectSnapshot {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.bpm === 'number' &&
    typeof value.playheadBeat === 'number' &&
    typeof value.isPlaying === 'boolean' &&
    isRecord(value.timeSignature) &&
    Array.isArray(value.tracks) &&
    isRecord(value.patterns) &&
    Array.isArray(value.blocks) &&
    Array.isArray(value.sections) &&
    Array.isArray(value.fxSummaries)
  );
}

function normalizeTracks(snapshot: ProjectSnapshot): ProjectSnapshot['tracks'] {
  return snapshot.tracks.map(track => ({
    ...track,
    isLocked: track.isLocked === true,
    isFrozen: track.isFrozen === true,
    trackFolderName: normalizeTrackOrganizationLabel(track.trackFolderName),
    trackGroupName: normalizeTrackOrganizationLabel(track.trackGroupName),
    trackHeightScale: storedTrackHeightScale(track.trackHeightScale),
    routingRole: storedTrackRoutingRole(track.routingRole),
    routingSends: track.routingSends?.map(send => ({...send})),
    routingSidechainSourceTrackId: track.routingSidechainSourceTrackId,
    samplerRegions: track.samplerRegions?.map(region => ({...region})),
  }));
}

function normalizeBlocks(snapshot: ProjectSnapshot): ProjectSnapshot['blocks'] {
  return snapshot.blocks.map(block => ({...block, isLocked: block.isLocked === true}));
}

function normalizeFxState(state: TrackFxState): TrackFxState {
  return withNormalizedPluginChain({
    trackId: state.trackId,
    slots: state.slots.map(slot => ({
      slot: slot.slot,
      enabled: slot.enabled,
      params: {
        pluginId: slot.params.pluginId,
        values: {...slot.params.values},
      },
    })),
    pluginChain: state.pluginChain?.map(slot => ({...slot})),
  });
}

export function normalizeSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
  const fxStates = Array.isArray(snapshot.fxStates)
    ? snapshot.fxStates.map(normalizeFxState)
    : snapshot.tracks.map(track => emptyTrackFxState(track.id));
  const ampSimStates = Array.isArray(snapshot.ampSimStates)
    ? snapshot.ampSimStates
    : snapshot.tracks
        .filter(track => track.type === 'voice_audio')
        .map(track => emptyTrackAmpSimState(track.id));
  const cycleRange = normalizeCycleRange(snapshot.cycleStartBeat, snapshot.cycleEndBeat);
  return {
    ...snapshot,
    bpm: normalizeTempoBpm(snapshot.bpm),
    tempoMap: normalizeTempoMap(snapshot.tempoMap),
    meterMap: normalizeMeterMap(snapshot.meterMap),
    tracks: normalizeTracks(snapshot),
    blocks: normalizeBlocks(snapshot),
    snapGrid: normalizeSnapGrid(snapshot.snapGrid),
    isRelativeSnapEnabled: snapshot.isRelativeSnapEnabled === true,
    recordingCountInBeats: normalizeRecordingCountInBeats(snapshot.recordingCountInBeats),
    recordingPreRollBeats: normalizeRecordingPreRollBeats(snapshot.recordingPreRollBeats),
    isPunchRecordingEnabled: snapshot.isPunchRecordingEnabled === true,
    isLoopRecordingEnabled: snapshot.isLoopRecordingEnabled === true,
    recordingLatencyCompensationMs: normalizeRecordingLatencyCompensationMs(
      snapshot.recordingLatencyCompensationMs,
    ),
    performanceMode: normalizePerformanceMode(snapshot.performanceMode),
    looperLengthBars: normalizeLooperLengthBars(snapshot.looperLengthBars),
    isCycleEnabled: snapshot.isCycleEnabled === true,
    cycleStartBeat: cycleRange.startBeat,
    cycleEndBeat: cycleRange.endBeat,
    timeSignature: normalizeTimeSignature(snapshot.timeSignature),
    mediaReferences: Array.isArray(snapshot.mediaReferences)
      ? snapshot.mediaReferences
      : mediaReferencesFromBlocks(snapshot.blocks),
    fxStates,
    fxSummaries: Array.isArray(snapshot.fxSummaries)
      ? snapshot.fxSummaries
      : fxStates.map(summarizeTrackFx),
    ampSimStates,
    copilotChats: normalizeCopilotChatProjectState(
      snapshot.copilotChats ?? emptyCopilotChatProjectState(),
    ),
  };
}
