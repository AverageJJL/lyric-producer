import {canonicalJsonStringify} from './canonicalJson';
import {
  captureProjectSnapshot,
  type ProjectSnapshot,
} from './projectSnapshot';
import {
  emptyTrackFxState,
  summarizeTrackFx,
  withNormalizedPluginChain,
  type TrackFxState,
} from '../native/fxContract';
import {emptyTrackAmpSimState} from '../native/ampSimContract';
import {
  type ApplyArrangementOptions,
} from './operations';
import {restoreProjectSnapshot} from './projectRestore';
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

export const PROJECT_DOCUMENT_FORMAT = 'ai-producer-core.project';
export const PROJECT_DOCUMENT_VERSION = 1;

export type ProjectDocument = {
  format: typeof PROJECT_DOCUMENT_FORMAT;
  version: typeof PROJECT_DOCUMENT_VERSION;
  savedAt: string;
  snapshot: ProjectSnapshot;
};

export type ProjectDocumentParseResult =
  | {ok: true; document: ProjectDocument}
  | {ok: false; error: string};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function hasSnapshotShape(value: unknown): value is ProjectSnapshot {
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

function mediaReferencesFromSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot['mediaReferences'] {
  return snapshot.blocks
    .filter(block => block.type === 'audio' && (block.audioFilePath || block.absoluteAudioFilePath))
    .map(block => ({
      clipId: block.id,
      trackId: block.trackId,
      kind: 'audio',
      name: block.mediaSourceName ?? block.name,
      relativePath: block.audioFilePath,
      absolutePath: block.absoluteAudioFilePath,
    }));
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

function normalizeSnapshot(snapshot: ProjectSnapshot): ProjectSnapshot {
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
      : mediaReferencesFromSnapshot(snapshot),
    fxStates,
    fxSummaries: Array.isArray(snapshot.fxSummaries)
      ? snapshot.fxSummaries
      : fxStates.map(summarizeTrackFx),
    ampSimStates,
  };
}

export function createProjectDocument(
  snapshot: ProjectSnapshot = captureProjectSnapshot(),
  savedAt = new Date().toISOString(),
): ProjectDocument {
  return {
    format: PROJECT_DOCUMENT_FORMAT,
    version: PROJECT_DOCUMENT_VERSION,
    savedAt,
    snapshot,
  };
}

export function serializeProjectDocument(
  document: ProjectDocument = createProjectDocument(),
): string {
  return canonicalJsonStringify(document);
}

export function parseProjectDocument(raw: string): ProjectDocumentParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {ok: false, error: 'Project document is not valid JSON.'};
  }

  if (!isRecord(parsed)) {
    return {ok: false, error: 'Project document must be a JSON object.'};
  }

  if (parsed.format !== PROJECT_DOCUMENT_FORMAT) {
    return {ok: false, error: 'Project document has an unsupported format.'};
  }

  if (parsed.version !== PROJECT_DOCUMENT_VERSION) {
    return {ok: false, error: 'Project document version is not supported.'};
  }

  if (typeof parsed.savedAt !== 'string') {
    return {ok: false, error: 'Project document is missing savedAt.'};
  }

  if (!hasSnapshotShape(parsed.snapshot)) {
    return {ok: false, error: 'Project document snapshot is incomplete.'};
  }

  return {
    ok: true,
    document: {
      ...(parsed as ProjectDocument),
      snapshot: normalizeSnapshot((parsed as ProjectDocument).snapshot),
    },
  };
}

export function openProjectDocument(
  document: ProjectDocument,
  options?: ApplyArrangementOptions,
): ProjectSnapshot {
  return restoreProjectSnapshot(document.snapshot, options);
}
