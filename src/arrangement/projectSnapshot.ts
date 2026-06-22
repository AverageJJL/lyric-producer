import type {DrumPattern} from '../music/drumPatterns';
import {normalizeDrumPattern} from '../music/drumPatterns';
import type {TrackFxState, TrackFxSummary} from '../native/fxContract';
import {getTrackFxState, normalizePluginChain, summarizeTrackFx} from '../native/fxContract';
import type {TrackAmpSimState} from '../native/ampSimContract';
import {getTrackAmpSimState} from '../native/ampSimContract';
import type {
  ChordMetadata,
  ScaleMetadata,
  SectionMarker,
  TimeSignature,
} from '../store/projectMetadata';
import {cloneSectionMarker, DEFAULT_TIME_SIGNATURE} from '../store/projectMetadata';
import {
  cloneLyricDocument,
  defaultLyricDocument,
  type LyricDocument,
} from '../store/lyrics';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';
import type {DAWStore} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import {
  captureCopilotChatProjectState,
  emptyCopilotChatProjectState,
  type CopilotChatProjectState,
} from '../assistant/copilotChatHistory';
import {mediaReferencesFromBlocks} from './mediaReferences';
import {canonicalJsonFingerprint} from './stableHash';
import {DEFAULT_SNAP_GRID, type SnapGrid} from '../ui/snapGrid';
import {DEFAULT_CYCLE_END_BEAT, DEFAULT_CYCLE_START_BEAT} from '../transport/cycleRange';
import {
  DEFAULT_LOOPER_LENGTH_BARS,
  DEFAULT_PERFORMANCE_MODE,
  type LooperLengthBars,
  type ProjectPerformanceMode,
} from '../transport/performanceMode';
import {
  DEFAULT_RECORDING_COUNT_IN_BEATS,
  DEFAULT_RECORDING_LATENCY_COMPENSATION_MS,
  DEFAULT_RECORDING_PRE_ROLL_BEATS,
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingCountInBeats,
  normalizeRecordingPreRollBeats,
  type RecordingCountInBeats,
  type RecordingLatencyCompensationMs,
  type RecordingPreRollBeats,
} from '../transport/recordingPreferences';
import {
  normalizeMeterMap,
  normalizeTempoBpm,
  normalizeTempoMap,
  type MeterMapEvent,
  type TempoMapEvent,
} from '../transport/tempoMap';
import {normalizeTrackOrganizationLabel, storedTrackHeightScale} from '../music/trackOrganization';
import {storedTrackRoutingRole} from '../music/trackRouting';

export type ProjectSnapshot = {
  bpm: number;
  tempoMap: TempoMapEvent[];
  meterMap: MeterMapEvent[];
  masterVolumeDb: number;
  masterPan: number;
  snapGrid: SnapGrid;
  isRelativeSnapEnabled: boolean;
  recordingCountInBeats: RecordingCountInBeats;
  recordingPreRollBeats: RecordingPreRollBeats;
  isPunchRecordingEnabled: boolean;
  isLoopRecordingEnabled: boolean;
  recordingLatencyCompensationMs: RecordingLatencyCompensationMs;
  performanceMode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
  isCycleEnabled: boolean;
  cycleStartBeat: number;
  cycleEndBeat: number;
  playheadBeat: number;
  isPlaying: boolean;
  timeSignature: TimeSignature;
  scale: ScaleMetadata | null;
  chord: ChordMetadata | null;
  sections: SectionMarker[];
  lyrics: LyricDocument;
  tracks: DAWTrack[];
  patterns: Record<string, DrumPattern>;
  blocks: DAWBlock[];
  mediaReferences: ProjectMediaReference[];
  /** Full FX plugin state persisted for project reopen. */
  fxStates: TrackFxState[];
  /** FX plugin state summaries from get_track_fx contract (mockable until native ships). */
  fxSummaries: TrackFxSummary[];
  /** Native guitar/bass DI amp-sim pedalboard and cabinet state. */
  ampSimStates: TrackAmpSimState[];
  /** Project-saved Copilot transcripts. Runtime request state stays out. */
  copilotChats: CopilotChatProjectState;
};

export type ProjectMediaReference = {
  clipId: string;
  trackId: string;
  kind: 'audio';
  name: string;
  relativePath?: string;
  absolutePath?: string;
};

const PROJECT_SNAPSHOT_SOURCE_KEYS = [
  'bpm',
  'tempoMap',
  'meterMap',
  'masterVolumeDb',
  'masterPan',
  'snapGrid',
  'isRelativeSnapEnabled',
  'recordingCountInBeats',
  'recordingPreRollBeats',
  'isPunchRecordingEnabled',
  'isLoopRecordingEnabled',
  'recordingLatencyCompensationMs',
  'performanceMode',
  'looperLengthBars',
  'isCycleEnabled',
  'cycleStartBeat',
  'cycleEndBeat',
  'playheadBeat',
  'isPlaying',
  'timeSignature',
  'scale',
  'chord',
  'sections',
  'lyrics',
  'tracks',
  'patterns',
  'blocks',
] as const satisfies readonly (keyof DAWStore)[];

export function projectSnapshotSourcesChanged(
  previous: DAWStore,
  next: DAWStore,
): boolean {
  return PROJECT_SNAPSHOT_SOURCE_KEYS.some(key => previous[key] !== next[key]);
}

function cloneTrack(track: DAWTrack): DAWTrack {
  return {
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
  };
}

function cloneBlock(block: DAWBlock): DAWBlock {
  return {
    ...block,
    isLocked: block.isLocked === true,
    notes: block.notes ? block.notes.map(note => ({...note})) : undefined,
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

function cloneFxState(state: TrackFxState): TrackFxState {
  return {
    trackId: state.trackId,
    slots: state.slots.map(slot => ({
      slot: slot.slot,
      enabled: slot.enabled,
      params: {
        pluginId: slot.params.pluginId,
        values: {...slot.params.values},
      },
    })),
    pluginChain: normalizePluginChain(state).map(slot => ({...slot})),
  };
}

function cloneAmpSimState(state: TrackAmpSimState): TrackAmpSimState {
  return {
    ...state,
    pedals: state.pedals.map(pedal => ({
      ...pedal,
      params: {...pedal.params},
    })),
    cabinet: {...state.cabinet},
  };
}

function clonePattern(pattern: DrumPattern): DrumPattern {
  const normalized = normalizeDrumPattern(pattern);
  return {
    ...normalized,
    steps: Object.fromEntries(
      Object.entries(normalized.steps).map(([key, row]) => [key, [...row]]),
    ) as DrumPattern['steps'],
  };
}

/** Read-only arrangement state for verification / future LLM replay checks. */
export function captureProjectSnapshot(): ProjectSnapshot {
  const state = useDAWStore.getState();
  const fxStates = state.tracks.map(track => cloneFxState(getTrackFxState(track.id)));
  const ampSimStates = state.tracks
    .filter(track => track.type === 'voice_audio')
    .map(track => cloneAmpSimState(getTrackAmpSimState(track.id)));
  return {
    bpm: normalizeTempoBpm(state.bpm),
    tempoMap: normalizeTempoMap(state.tempoMap),
    meterMap: normalizeMeterMap(state.meterMap),
    masterVolumeDb: state.masterVolumeDb,
    masterPan: state.masterPan,
    snapGrid: state.snapGrid,
    isRelativeSnapEnabled: state.isRelativeSnapEnabled,
    recordingCountInBeats: normalizeRecordingCountInBeats(state.recordingCountInBeats),
    recordingPreRollBeats: normalizeRecordingPreRollBeats(state.recordingPreRollBeats),
    isPunchRecordingEnabled: state.isPunchRecordingEnabled === true,
    isLoopRecordingEnabled: state.isLoopRecordingEnabled === true,
    recordingLatencyCompensationMs: normalizeRecordingLatencyCompensationMs(
      state.recordingLatencyCompensationMs,
    ),
    performanceMode: state.performanceMode,
    looperLengthBars: state.looperLengthBars,
    isCycleEnabled: state.isCycleEnabled,
    cycleStartBeat: state.cycleStartBeat,
    cycleEndBeat: state.cycleEndBeat,
    playheadBeat: state.playheadBeat,
    isPlaying: state.isPlaying,
    timeSignature: {...state.timeSignature},
    scale: state.scale ? {...state.scale} : null,
    chord: state.chord ? {...state.chord} : null,
    sections: state.sections.map(cloneSectionMarker),
    lyrics: cloneLyricDocument(state.lyrics),
    tracks: state.tracks.map(cloneTrack),
    patterns: Object.fromEntries(
      Object.entries(state.patterns).map(([id, pattern]) => [id, clonePattern(pattern)]),
    ),
    blocks: state.blocks.map(cloneBlock),
    mediaReferences: mediaReferencesFromBlocks(state.blocks),
    fxStates,
    fxSummaries: fxStates.map(summarizeTrackFx),
    ampSimStates,
    copilotChats: captureCopilotChatProjectState(),
  };
}

export function snapshotFingerprint(snapshot: ProjectSnapshot): string {
  return canonicalJsonFingerprint(snapshot);
}

export function emptyProjectSnapshot(): ProjectSnapshot {
  return {
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    recordingCountInBeats: DEFAULT_RECORDING_COUNT_IN_BEATS,
    recordingPreRollBeats: DEFAULT_RECORDING_PRE_ROLL_BEATS,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: DEFAULT_RECORDING_LATENCY_COMPENSATION_MS,
    performanceMode: DEFAULT_PERFORMANCE_MODE,
    looperLengthBars: DEFAULT_LOOPER_LENGTH_BARS,
    isCycleEnabled: false,
    cycleStartBeat: DEFAULT_CYCLE_START_BEAT,
    cycleEndBeat: DEFAULT_CYCLE_END_BEAT,
    playheadBeat: 0,
    isPlaying: false,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    lyrics: defaultLyricDocument(),
    tracks: [],
    patterns: {},
    blocks: [],
    mediaReferences: [],
    fxStates: [],
    fxSummaries: [],
    ampSimStates: [],
    copilotChats: emptyCopilotChatProjectState(),
  };
}
