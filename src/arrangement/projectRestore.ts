import type {DrumPattern} from '../music/drumPatterns';
import {normalizeDrumPattern} from '../music/drumPatterns';
import {refreshPlaybackAndInstruments} from '../native/refreshPlayback';
import {setTrackAmpSimState} from '../native/ampSimContract';
import {setTrackFxState} from '../native/fxContractOps';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {
  captureProjectSnapshot,
  type ProjectSnapshot,
} from './projectSnapshot';
import {restoreCopilotChatProjectState} from '../assistant/copilotChatHistory';
import type {ApplyArrangementOptions} from './operations';
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
import {normalizeTrackOrganizationLabel} from '../music/trackOrganization';
import {storedTrackRoutingRole} from '../music/trackRouting';
import {cloneSectionMarker, normalizeTimeSignature} from '../store/projectMetadata';

export type RestoreProjectSnapshotOptions = ApplyArrangementOptions & {
  /** Copilot staging reuses project snapshots as transient previews; those must not rewind live chat. */
  restoreCopilotChats?: boolean;
};

function blockFromSnapshot(block: DAWBlock): DAWBlock {
  return {
    ...block,
    isLocked: block.isLocked === true,
    notes: block.notes ? block.notes.map(note => ({...note})) : undefined,
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

function patternFromSnapshot(pattern: DrumPattern): DrumPattern {
  const normalized = normalizeDrumPattern(pattern);
  return {
    ...normalized,
    steps: Object.fromEntries(
      Object.entries(normalized.steps).map(([key, row]) => [key, [...row]]),
    ) as DrumPattern['steps'],
  };
}

/**
 * Replace the entire UI-authoritative project arrangement.
 * This is intentionally stronger than replaying operations: project Open must remove
 * tracks/clips that are not present in the saved document instead of merging them.
 */
export function restoreProjectSnapshot(
  snapshot: ProjectSnapshot,
  options?: RestoreProjectSnapshotOptions,
): ProjectSnapshot {
  if (options?.restoreCopilotChats !== false) {
    restoreCopilotChatProjectState(snapshot.copilotChats);
  }
  const bpm = normalizeTempoBpm(snapshot.bpm);
  const secondsPerBeat = bpm > 0 ? 60 / bpm : 0.5;
  const cycleRange = normalizeCycleRange(snapshot.cycleStartBeat, snapshot.cycleEndBeat);
  useDAWStore.setState({
    isPlaying: snapshot.isPlaying,
    bpm,
    tempoMap: normalizeTempoMap(snapshot.tempoMap),
    meterMap: normalizeMeterMap(snapshot.meterMap),
    masterVolumeDb: snapshot.masterVolumeDb ?? 0,
    masterPan: snapshot.masterPan ?? 0,
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
    tracks: snapshot.tracks.map(track => ({
      ...track,
      isLocked: track.isLocked === true,
      isFrozen: track.isFrozen === true,
      trackFolderName: normalizeTrackOrganizationLabel(track.trackFolderName),
      trackGroupName: normalizeTrackOrganizationLabel(track.trackGroupName),
      routingRole: storedTrackRoutingRole(track.routingRole),
      routingSends: track.routingSends?.map(send => ({...send})),
      routingSidechainSourceTrackId: track.routingSidechainSourceTrackId,
      samplerRegions: track.samplerRegions?.map(region => ({...region})),
    })),
    patterns: Object.fromEntries(
      Object.entries(snapshot.patterns).map(([id, pattern]) => [
        id,
        patternFromSnapshot(pattern),
      ]),
    ),
    blocks: snapshot.blocks.map(blockFromSnapshot),
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    nativeCountInActive: false,
    playheadBeat: snapshot.playheadBeat,
    playheadSeconds: snapshot.playheadBeat * secondsPerBeat,
    playheadOwnedByUser: !snapshot.isPlaying,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: snapshot.playheadBeat * secondsPerBeat,
    syncSource: 'ui',
    timeSignature: normalizeTimeSignature(snapshot.timeSignature),
    scale: snapshot.scale ? {...snapshot.scale} : null,
    chord: snapshot.chord ? {...snapshot.chord} : null,
    sections: snapshot.sections.map(cloneSectionMarker),
    midiAudition: null,
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
    auditionedRecordingTakeId: null,
  });

  if (!options?.skipNativeRefresh) {
    refreshPlaybackAndInstruments();
    const ampTrackIds = new Set(
      snapshot.tracks.filter(track => track.type === 'voice_audio').map(track => track.id),
    );
    snapshot.ampSimStates
      .filter(ampState => ampTrackIds.has(ampState.trackId))
      .forEach(ampState => setTrackAmpSimState(ampState));
    snapshot.fxStates.forEach(fxState => setTrackFxState(fxState));
  }

  return captureProjectSnapshot();
}
