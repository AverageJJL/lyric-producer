import {create} from 'zustand';

import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import {refreshPlaybackAndInstruments} from '../native/refreshPlayback';
import {
  createDefaultDrumPatternBlock,
  createMidiClipBlock,
  createRecordingAudioBlock,
  createRecordingMidiBlock,
  isDrumPatternBlock,
} from '../music/clipFactories';
import type {DrumSampleKey} from '../assets/drumKit';
import type {SampleInstrumentRegion} from '../music/sampleInstruments';
import {
  createEmptyPattern,
  snapLengthToSteps,
  toggleStep,
  type DrumPattern,
} from '../music/drumPatterns';
import {upsertBlockForEngine} from '../native/refreshPlayback';
import {
  instrumentForTrack,
  SYNTH_LEAD,
} from '../music/instruments';
import {
  activeTracks,
  isTrackFrozen,
  moveActiveTrack,
  normalizeTrackOrganizationLabel,
  setTrackArchiveState,
  setTrackDisabledState,
  setTrackFrozenState,
  setTrackHeightScaleState,
  trackIsVisible,
  type TrackMoveDirection,
} from '../music/trackOrganization';
import {
  MASTER_OUTPUT_ID,
  normalizeTrackOutputTarget,
  normalizeTrackRoutingRole,
  normalizeTrackRoutingSends,
  normalizeTrackSidechainSource,
  removeTrackRoutingTarget,
  storedTrackRoutingRole,
  type TrackRoutingRole,
  type TrackRoutingSend,
} from '../music/trackRouting';
import {
  createTrackFromTemplate,
  type TrackTemplateOptions,
  type TrackTemplateId,
} from '../music/trackTemplates';
import {
  clampTrackGainDb,
  clampTrackPan,
  clampTrackVolumeDb,
  DEFAULT_MASTER_PAN,
  DEFAULT_MASTER_VOLUME_DB,
  normalizeTrackMix,
} from '../music/trackMix';
import {
  clampMoveStartBeat,
  clampResizeFromLeft,
  clampResizeFromRight,
  recordingClipLengthBeats,
} from '../music/timelineCollision';
import {trimNotesToAbsoluteRange} from '../music/midiClipTrim';
import {buildNativeTransportPayload} from '../native/transportPayload';
import {computeVisibleTimelineBeats} from '../ui/timelineExtent';
import {BLOCK_COLORS, RECORDING_MIN_VISIBLE_BEATS} from '../ui/timelineLayout';
import {DEFAULT_SNAP_GRID, normalizeSnapGrid, type SnapGrid} from '../ui/snapGrid';
import {
  DEFAULT_CYCLE_END_BEAT,
  DEFAULT_CYCLE_START_BEAT,
  normalizeCycleRange,
} from '../transport/cycleRange';
import {
  DEFAULT_LOOPER_LENGTH_BARS,
  DEFAULT_PERFORMANCE_MODE,
  normalizeLooperLengthBars,
  normalizePerformanceMode,
  type LooperLengthBars,
  type ProjectPerformanceMode,
} from '../transport/performanceMode';
import {
  blocksAfterLooperComp,
  finalizedLooperOverdubSegments,
  isLooperOverdubBlock,
  looperOverdubName,
  prepareLooperRecordingBlock,
} from '../transport/looperOverdub';
import {finalizedLoopRecordingTakes} from '../transport/loopRecording';
import {
  blocksWithDefaultRecordingCompOutput,
  duplicateRecordingCompVersionBlocks,
  fullTakeCompSegmentsForGroup,
  materializeRecordingCompOutput,
  replaceCompRange,
  renameRecordingCompVersionBlocks,
  switchRecordingCompVersionBlocks,
} from '../transport/recordingComp';
import {
  blocksAfterRecordingTakeComp,
  blocksWithFinalizedRecordingTake,
} from '../transport/recordingTakes';
import {
  DEFAULT_RECORDING_COUNT_IN_BEATS,
  DEFAULT_RECORDING_LATENCY_COMPENSATION_MS,
  DEFAULT_RECORDING_PRE_ROLL_BEATS,
  normalizeRecordingLatencyCompensationMs,
  normalizeRecordingCountInBeats,
  normalizeRecordingPreRollBeats,
  recordingLatencyCompensationBeats,
  resolvedRecordingLatencyCompensationMs,
  type RecordingCountInBeats,
  type RecordingLatencyCompensationMs,
  type RecordingPreRollBeats,
} from '../transport/recordingPreferences';
import {
  normalizeTempoBpm,
  removeMeterMapEventAtBeat,
  removeTempoMapEventAtBeat,
  upsertMeterMapEvent,
  upsertTempoMapEvent,
  type MeterMapEvent,
  type TempoMapEvent,
  type TempoMapRamp,
} from '../transport/tempoMap';
import {
  tempoMapBeatAtSeconds,
  tempoMapSecondsAtBeat,
} from '../transport/tempoMapTiming';
import {
  defaultTrackAutomationLanes,
  normalizeAutomationMode,
  removeAutomationPoint,
  upsertAutomationPoint,
  upsertAutomationLane,
  type AutomationMode,
  type AutomationTargetType,
  type TrackAutomationLane,
} from '../automation/trackAutomation';

function maxTimelineBeatForState(state: {
  blocks: DAWBlock[];
  sections: SectionMarker[];
  lyrics: LyricDocument;
  playheadBeat: number;
  recordingBlockId: string | null;
}): number {
  return computeVisibleTimelineBeats({
    blocks: state.blocks,
    sections: state.sections,
    lyrics: state.lyrics,
    playheadBeat: state.playheadBeat,
    recordingBlockId: state.recordingBlockId,
  });
}
import {
  canRedoArrangement,
  canUndoArrangement,
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
  redoArrangement,
  undoArrangement,
} from './history';
import {
  beatsPerBarForTimeSignature,
  DEFAULT_TIME_SIGNATURE,
  normalizeTimeSignature,
  type ChordMetadata,
  type ScaleMetadata,
  type SectionMarker,
  type TimeSignature,
} from './projectMetadata';
import type {LiveAudioPreview, LiveMidiPreview} from './livePreview';
import {createLivePreviewActions} from './livePreviewActions';
import {createLyricActions, type LyricActions} from './lyricActions';
import {defaultLyricDocument, type LyricDocument} from './lyrics';
import {
  buildRecordedWavSpectrogramRequest,
  dispatchRenderSpectrogram,
} from '../native/spectrogramContract';

export type TrackType =
  | 'software_instrument'
  | 'voice_audio'
  | 'drum_machine';

export type DAWTrack = {
  id: string;
  name: string;
  isMuted: boolean;
  isSolo: boolean;
  type: TrackType;
  instrumentId: string;
  presetId: string;
  isRecordArmed: boolean;
  /** Native input monitoring policy; renderer never loops audio itself. */
  isInputMonitoringEnabled?: boolean;
  automationMode?: AutomationMode;
  automationLanes?: TrackAutomationLane[];
  /** When true, AI/LLM edits should skip this track (Phase 2 constraint locks). */
  isLocked: boolean;
  /** Track fader in dB; C++ applies this through Tracktion's volume plugin. */
  volumeDb?: number;
  /** Stereo pan from full-left -1 to full-right +1. */
  pan?: number;
  /** Input-style trim stored separately, then combined with the fader for native playback. */
  gainDb?: number;
  /** Archived tracks stay in the project but are hidden from timeline/native playback. */
  isArchived?: boolean;
  /** Disabled tracks stay visible/editable but are excluded from native playback. */
  isDisabled?: boolean;
  /** Frozen tracks remain playable but reject AI/scripted edits and cannot be record-monitored. */
  isFrozen?: boolean;
  /** Transient Copilot staging marker; Accept removes the track, Reject clears it. */
  pendingDeletion?: boolean;
  /** Metadata-only folder/group labels for DAW organization and future native grouping. */
  trackFolderName?: string;
  trackGroupName?: string;
  /** UI-only lane height metadata; audio timing stays in C++ and beat units. */
  trackHeightScale?: number;
  /** Metadata-only routing graph; renderer stores intent while C++ owns audio graph execution. */
  routingRole?: TrackRoutingRole;
  routingOutputTrackId?: string;
  routingSends?: TrackRoutingSend[];
  routingSidechainSourceTrackId?: string;
  /** Programmatic sample-instrument regions for AI-created sliced sampler tracks. */
  samplerRegions?: SampleInstrumentRegion[];
};

export type DAWBlockType = 'midi' | 'audio';

export type DAWNote = {
  note: number;
  velocity: number;
  startBeat: number;
  lengthBeats: number;
};

export type RecordingCompSegment = {
  id: string;
  takeId: string;
  startBeat: number;
  endBeat: number;
  fadeInBeats?: number;
  fadeOutBeats?: number;
};

export type RecordingCompVersion = {
  id: string;
  name: string;
  segments: RecordingCompSegment[];
};

export type DAWBlock = {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  type: DAWBlockType;
  color: string;
  /** When true, AI/LLM operations must not mutate or delete this clip. */
  isLocked?: boolean;
  /** Transient Copilot staging marker; Accept removes the clip, Reject clears it. */
  pendingDeletion?: boolean;
  /** Looper overdubs stay as normal clips; this metadata groups wrap segments for future comping. */
  looperLayerId?: string;
  looperLayerIndex?: number;
  looperBaseStartBeat?: number;
  looperLengthBeats?: number;
  /** Linear recording take metadata lets comping mute sibling takes non-destructively. */
  recordingTakeGroupId?: string;
  recordingTakeId?: string;
  recordingTakeIndex?: number;
  /** Take-folder activity is separate from user clip mute so old comp states do not hijack Mute. */
  recordingTakeActive?: boolean;
  recordingCompGroupId?: string;
  recordingCompSourceTakeId?: string;
  recordingCompSegmentId?: string;
  recordingCompSegments?: RecordingCompSegment[];
  recordingCompVersions?: RecordingCompVersion[];
  activeRecordingCompVersionId?: string;
  /** UI-only synthetic shell used to render one take-folder header while native plays real slices. */
  isRecordingCompDisplayBlock?: boolean;
  /** Concrete recording latency compensation applied at finalize time. */
  recordingLatencyCompensationMs?: number;
  recordingLatencyCompensationBeats?: number;
  recordingLatencyCompensationSource?: 'manual' | 'native';
  recordingNativeInputLatencyMs?: number;
  recordingNativeOutputLatencyMs?: number;
  notes?: DAWNote[];
  /** Drum machine clips reference a pattern in `patterns` (not raw MIDI hits). */
  patternId?: string;
  /** Full recorded audio length (non-destructive trim). */
  sourceLengthBeats?: number;
  /** Trim offset into source audio. */
  sourceOffsetBeats?: number;
  /** Audio-editor mute is project state; native sync removes/restores playback clips. */
  isMuted?: boolean;
  /** Per-clip audio gain in dB; applied by C++ when native clips are rebuilt. */
  clipGainDb?: number;
  /** Non-destructive audio fade lengths in project beats. */
  fadeInBeats?: number;
  fadeOutBeats?: number;
  /** Non-destructive source playback reversal for file-backed audio clips. */
  isReversed?: boolean;
  /** Relative path under asset root for recorded/imported audio. */
  audioFilePath?: string;
  /** Resolved path on disk (MSIX LocalCache); used for engine playback. */
  absoluteAudioFilePath?: string;
  /** User-facing media-source alias shared by clips that reference the same file. */
  mediaSourceName?: string;
  /** True when a saved/imported audio source cannot be found on project open. */
  isMissingMedia?: boolean;
  missingMediaReason?: string;
  /** Normalized peak samples for inline waveform (from C++ analysis). */
  waveformPeaks?: number[];
  /** Captured audio length in seconds (from stop_audio_recording). */
  durationSeconds?: number;
  /** Native analysis metadata for imported media validation. */
  sourceSampleRate?: number;
  sourceChannelCount?: number;
  sourceFileBytes?: number;
  sourcePeakAmplitude?: number;
  mediaValidationWarning?: string;
  /** Pending native mel render (Phase 1.3). */
  spectrogramRequestId?: string;
  /** Relative path under writable asset root when render completes. */
  spectrogramPngPath?: string;
  spectrogramError?: string;
};

export type RecordingFinalizePayload = {
  notes?: DAWNote[];
  audioFilePath?: string;
  absoluteAudioFilePath?: string;
  lengthBeats?: number;
  durationSeconds?: number;
  waveformPeaks?: number[];
  sourceSampleRate?: number;
  sourceChannelCount?: number;
  sourceFileBytes?: number;
  sourcePeakAmplitude?: number;
  mediaValidationWarning?: string;
  /** Native metadata used only to calculate a clip time shift, not to process audio in JS. */
  recordingLatencyCompensationMs?: number;
  nativeInputLatencyMs?: number;
  nativeOutputLatencyMs?: number;
};

export type AudioBlockMediaReplacement = {
  name?: string;
  audioFilePath: string;
  absoluteAudioFilePath: string;
  mediaSourceName?: string;
  lengthBeats?: number;
  durationSeconds?: number;
  waveformPeaks?: number[];
  sourceSampleRate?: number;
  sourceChannelCount?: number;
  sourceFileBytes?: number;
  sourcePeakAmplitude?: number;
  mediaValidationWarning?: string;
};

/** Prefer native file duration; fall back to UI-grown clip when capture wrote little/no audio. */
function resolveAudioRecordedLengthBeats(
  block: DAWBlock,
  payload: RecordingFinalizePayload,
): number {
  const grownLength = Math.max(
    block.lengthBeats,
    block.sourceLengthBeats ?? block.lengthBeats,
  );
  const nativeLength = Math.max(1, payload.lengthBeats ?? grownLength);
  const durationSeconds = payload.durationSeconds ?? 0;

  if (durationSeconds > 0.05) {
    return nativeLength;
  }

  return Math.max(nativeLength, grownLength);
}

export type SyncSource = 'ui' | 'engine';

  /** Live keyboard or clip preview, not scheduled transport playback. */
export type MidiAuditionSource = 'keyboard' | 'clip';

export type MidiAuditionState = {
  trackId: string;
  source: MidiAuditionSource;
};

type DAWState = {
  isPlaying: boolean;
  bpm: number;
  tempoMap: TempoMapEvent[];
  meterMap: MeterMapEvent[];
  isMetronomeEnabled: boolean;
  recordingCountInBeats: RecordingCountInBeats;
  recordingPreRollBeats: RecordingPreRollBeats;
  isPunchRecordingEnabled: boolean;
  isLoopRecordingEnabled: boolean;
  recordingLatencyCompensationMs: RecordingLatencyCompensationMs;
  tracks: DAWTrack[];
  patterns: Record<string, DrumPattern>;
  blocks: DAWBlock[];
  masterVolumeDb: number;
  masterPan: number;
  snapGrid: SnapGrid;
  isRelativeSnapEnabled: boolean;
  performanceMode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
  isCycleEnabled: boolean;
  cycleStartBeat: number;
  cycleEndBeat: number;
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  selectedTrackId: string | null;
  isRecording: boolean;
  recordingBlockId: string | null;
  recordingStartSeconds: number | null;
  /** Wall-clock anchor when recording started (fallback if engine transport stalls). */
  recordingWallClockStart: number | null;
  recordingError: string | null;
  /** Native may run a hidden click-only transport here; renderer playhead must stay fixed. */
  nativeCountInActive: boolean;
  playheadBeat: number;
  playheadSeconds: number;
  /** When true, engine transport ticks do not overwrite the UI playhead while paused. */
  playheadOwnedByUser: boolean;
  /** After Play, ignore engine isPlaying:false until native transport actually starts. */
  playAwaitingEngine: boolean;
  /** Wall-clock anchor when Play was pressed (drives playhead until engine catches up). */
  playWallClockAnchor: number | null;
  /** Transport seconds at Play press, pairs with playWallClockAnchor. */
  playStartSeconds: number;
  syncSource: SyncSource;
  timeSignature: TimeSignature;
  scale: ScaleMetadata | null;
  chord: ChordMetadata | null;
  sections: SectionMarker[];
  lyrics: LyricDocument;
  /** When set, sound is from explicit audition (keyboard/clip), not transport crossing clips. */
  midiAudition: MidiAuditionState | null;
  /** Transient MIDI input visualization, not in undo/snapshots. */
  liveMidiPreviewByTrack: Record<string, LiveMidiPreview>;
  /** Transient audio waveform while recording, not in undo/snapshots. */
  liveAudioPreviewByClip: Record<string, LiveAudioPreview>;
  /** Temporary take-folder audition source; not persisted as a real comp selection. */
  auditionedRecordingTakeId: string | null;
};

type DAWActions = LyricActions & {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setIsPlaying: (isPlaying: boolean) => void;
  setPlayheadBeat: (
    beat: number,
    options?: {pauseIfPlaying?: boolean; syncTransport?: boolean},
  ) => void;
  setBpm: (bpm: number) => void;
  setTempoMapEvent: (beat: number, bpm: number, ramp?: TempoMapRamp) => void;
  removeTempoMapEventAtBeat: (beat: number) => void;
  setMeterMapEvent: (beat: number, timeSignature: TimeSignature) => void;
  removeMeterMapEventAtBeat: (beat: number) => void;
  setMetronomeEnabled: (enabled: boolean) => void;
  setRecordingCountInBeats: (beats: RecordingCountInBeats) => void;
  setRecordingPreRollBeats: (beats: RecordingPreRollBeats) => void;
  setPunchRecordingEnabled: (enabled: boolean) => void;
  setLoopRecordingEnabled: (enabled: boolean) => void;
  setRecordingLatencyCompensationMs: (milliseconds: RecordingLatencyCompensationMs) => void;
  addTrackFromTemplate: (
    templateId: TrackTemplateId,
    options?: TrackTemplateOptions,
  ) => void;
  addSoftwareInstrumentTrack: () => void;
  addVoiceAudioTrack: () => void;
  addDrumMachineTrack: () => void;
  moveTrack: (trackId: string, direction: TrackMoveDirection) => void;
  setTrackArchived: (trackId: string, isArchived: boolean) => void;
  setTrackDisabled: (trackId: string, isDisabled: boolean) => void;
  setTrackFrozen: (trackId: string, isFrozen: boolean) => void;
  setTrackFolderName: (trackId: string, folderName: string | null) => void;
  setTrackGroupName: (trackId: string, groupName: string | null) => void;
  setTrackHeightScale: (trackId: string, trackHeightScale: number | null) => void;
  setTrackInstrument: (trackId: string, instrumentId: string, presetId?: string) => void;
  removeTrack: (trackId: string) => void;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackSolo: (trackId: string) => void;
  setTrackInputMonitoring: (trackId: string, enabled: boolean) => void;
  setTrackAutomationMode: (trackId: string, mode: AutomationMode) => void;
  upsertTrackAutomationLane: (trackId: string, lane: TrackAutomationLane) => void;
  setTrackAutomationPoint: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
    value: number,
  ) => void;
  removeTrackAutomationPoint: (
    trackId: string,
    targetType: AutomationTargetType,
    parameterId: string,
    beat: number,
  ) => void;
  setTrackVolumeDb: (trackId: string, volumeDb: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackGainDb: (trackId: string, gainDb: number) => void;
  setTrackRoutingRole: (trackId: string, role: TrackRoutingRole) => void;
  setTrackOutput: (trackId: string, outputTrackId: string | null) => void;
  setTrackSend: (
    trackId: string,
    targetTrackId: string,
    gainDb: number,
    preFader?: boolean,
  ) => void;
  removeTrackSend: (trackId: string, targetTrackId: string) => void;
  setTrackSidechainSource: (trackId: string, sourceTrackId: string | null) => void;
  setMasterVolumeDb: (volumeDb: number) => void;
  setMasterPan: (pan: number) => void;
  setSnapGrid: (snapGrid: SnapGrid) => void;
  setRelativeSnapEnabled: (enabled: boolean) => void;
  setPerformanceMode: (mode: ProjectPerformanceMode) => void;
  setLooperLengthBars: (bars: LooperLengthBars) => void;
  setCycleEnabled: (enabled: boolean) => void;
  setCycleRange: (
    startBeat: number,
    endBeat: number,
    options?: {enable?: boolean},
  ) => void;
  setTrackPreset: (trackId: string, presetId: string) => void;
  setTrackLocked: (trackId: string, isLocked: boolean) => void;
  setTimeSignature: (timeSignature: TimeSignature) => void;
  setScale: (scale: ScaleMetadata | null) => void;
  setChord: (chord: ChordMetadata | null) => void;
  setSections: (sections: SectionMarker[]) => void;
  toggleTrackRecordArm: (trackId: string) => void;
  selectTrack: (trackId: string) => void;
  setIsRecording: (isRecording: boolean) => void;
  startRecordingSession: (trackId: string, playheadBeat: number) => string | null;
  activateRecordingSession: () => void;
  abortRecordingSession: (message: string) => void;
  clearRecordingError: () => void;
  finalizeRecordingSession: (payload?: DAWNote[] | RecordingFinalizePayload) => void;
  addTrackWithBlock: (track: DAWTrack, block: DAWBlock) => void;
  addBlock: (block: DAWBlock) => void;
  createMidiClipAtBeat: (trackId: string, beat: number, lengthBeats?: number) => string | null;
  moveBlock: (blockId: string, startBeat: number, trackId?: string) => void;
  resizeBlock: (blockId: string, startBeat: number, lengthBeats: number) => void;
  updateBlock: (blockId: string, updates: Partial<Pick<DAWBlock, 'name' | 'isMuted'>>) => void;
  setMediaSourceName: (blockId: string, name: string) => void;
  setBlockLocked: (blockId: string, isLocked: boolean) => void;
  compLooperLayer: (layerId: string) => void;
  compRecordingTake: (takeId: string) => void;
  setRecordingCompRange: (
    groupId: string,
    takeId: string,
    startBeat: number,
    endBeat: number,
  ) => void;
  selectRecordingCompTake: (groupId: string, takeId: string) => void;
  setAuditionedRecordingTake: (takeId: string | null) => void;
  switchRecordingCompVersion: (groupId: string, versionId: string) => void;
  duplicateRecordingCompVersion: (groupId: string) => void;
  renameRecordingCompVersion: (groupId: string, versionId: string, name: string) => void;
  flattenRecordingCompGroup: (groupId: string, block: DAWBlock) => void;
  replaceAudioBlockMedia: (blockId: string, media: AudioBlockMediaReplacement) => void;
  replaceAudioBlocksMedia: (
    replacements: Array<{blockId: string; media: AudioBlockMediaReplacement}>,
  ) => void;
  removeBlock: (blockId: string) => void;
  removeBlocks: (blockIds: string[]) => void;
  selectBlock: (blockId: string | null, options?: {additive?: boolean}) => void;
  addNoteToBlock: (blockId: string, note: DAWNote) => void;
  removeNoteFromBlock: (blockId: string, noteIndex: number) => void;
  updateNoteInBlock: (blockId: string, noteIndex: number, updates: Partial<DAWNote>) => void;
  replaceBlockNotes: (blockId: string, notes: DAWNote[]) => void;
  toggleDrumStep: (
    patternId: string,
    sampleKey: string,
    step: number,
    options?: {syncEngine?: boolean},
  ) => void;
  createDrumPattern: (name: string) => string;
  applyEngineTransportState: (payload: {
    isPlaying?: boolean;
    positionSeconds?: number;
    positionBeat?: number;
    bpm?: number;
    clickTrackEnabled?: boolean;
  }) => void;
  setMidiAudition: (audition: MidiAuditionState) => void;
  clearMidiAudition: () => void;
  beginLiveMidiNote: (trackId: string, note: number, velocity: number, playheadBeat: number) => void;
  endLiveMidiNote: (trackId: string, note: number, playheadBeat: number) => void;
  tickLiveMidiPreview: (playheadBeat: number) => void;
  clearLiveMidiPreview: (trackId?: string) => void;
  appendLiveAudioPeaks: (trackId: string, clipId: string, peaks: number[]) => void;
  clearLiveAudioPreview: (clipId?: string) => void;
  requestSpectrogramForRecordedClip: (clipId: string, audioFilePath: string) => void;
  applySpectrogramReady: (payload: {
    requestId: string;
    pngPath: string;
    ok: boolean;
    error?: string;
  }) => void;
};

export type DAWStore = DAWState & DAWActions;

function recordHistoryBeforeMutation(get: () => DAWStore): void {
  recordArrangementHistory(captureArrangementHistorySnapshot(get()));
}

function jsonEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeAutomationPointValue(
  targetType: AutomationTargetType,
  parameterId: string,
  value: number,
): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  if (targetType === 'track' && parameterId === 'volumeDb') {
    return clampTrackVolumeDb(value);
  }
  if (targetType === 'track' && parameterId === 'pan') {
    return clampTrackPan(value);
  }
  return value;
}

function routingOutputForState(targetTrackId: string): string | undefined {
  return targetTrackId === MASTER_OUTPUT_ID ? undefined : targetTrackId;
}

function routingSendsForState(sends: TrackRoutingSend[]): TrackRoutingSend[] | undefined {
  return sends.length > 0 ? sends.map(send => ({...send})) : undefined;
}

function trackWithSidechainSource(track: DAWTrack, sourceTrackId: string | undefined): DAWTrack {
  const next = {...track};
  if (sourceTrackId) {
    next.routingSidechainSourceTrackId = sourceTrackId;
  } else {
    delete next.routingSidechainSourceTrackId;
  }
  return next;
}

function trackWithOrganizationLabel(
  track: DAWTrack,
  key: 'trackFolderName' | 'trackGroupName',
  value: string | undefined,
): DAWTrack {
  const next = {...track};
  if (value) {
    next[key] = value;
  } else {
    delete next[key];
  }
  return next;
}

function historyContext(get: () => DAWStore, set: (partial: Partial<DAWState> | ((state: DAWState) => Partial<DAWState>)) => void) {
  return {
    getSnapshot: () => captureArrangementHistorySnapshot(get()),
    applySnapshot: (snapshot: ReturnType<typeof captureArrangementHistorySnapshot>) => {
      const current = get();
      set({
        ...snapshot,
        isPlaying: current.isPlaying,
        playheadBeat: current.playheadBeat,
        playheadSeconds: current.playheadSeconds,
        selectedBlockId: current.selectedBlockId,
        selectedBlockIds: current.selectedBlockIds,
        selectedTrackId: current.selectedTrackId,
        isRecording: current.isRecording,
        recordingBlockId: current.recordingBlockId,
        recordingStartSeconds: current.recordingStartSeconds,
        recordingWallClockStart: current.recordingWallClockStart,
        recordingError: current.recordingError,
        playheadOwnedByUser: current.playheadOwnedByUser,
        playAwaitingEngine: current.playAwaitingEngine,
        playWallClockAnchor: current.playWallClockAnchor,
        playStartSeconds: current.playStartSeconds,
        auditionedRecordingTakeId: null,
        syncSource: 'ui',
      });
    },
  };
}

function defaultSelectedTrackId(
  tracks: DAWTrack[],
  selectedBlockId: string | null,
  blocks: DAWBlock[],
): string | null {
  if (selectedBlockId) {
    const selectedBlock = blocks.find(block => block.id === selectedBlockId);
    if (selectedBlock) {
      return selectedBlock.trackId;
    }
  }

  const panelTrack = tracks.find(track => isBottomPanelTrackType(track.type));
  return panelTrack?.id ?? null;
}

function isBottomPanelTrackType(type: TrackType): boolean {
  return type === 'software_instrument' || type === 'drum_machine';
}

function selectTrackOnAdd(track: DAWTrack): boolean {
  return isBottomPanelTrackType(track.type);
}

function timingFieldsEqual(left: DAWBlock, right: DAWBlock): boolean {
  return left.trackId === right.trackId
    && left.startBeat === right.startBeat
    && left.lengthBeats === right.lengthBeats
    && left.sourceOffsetBeats === right.sourceOffsetBeats
    && left.sourceLengthBeats === right.sourceLengthBeats;
}

function resizedBlockForState(
  state: DAWState,
  block: DAWBlock,
  startBeat: number,
  lengthBeats: number,
): DAWBlock {
  if (isDrumPatternBlock(block)) {
    const snappedLength = snapLengthToSteps(lengthBeats);
    const currentEnd = block.startBeat + block.lengthBeats;
    if (startBeat !== block.startBeat) {
      const clamped = clampResizeFromLeft(state.blocks, block.id, block.trackId, startBeat, currentEnd);
      return {...block, startBeat: clamped.startBeat, lengthBeats: snapLengthToSteps(clamped.lengthBeats)};
    }

    const clampedLength = snapLengthToSteps(
      clampResizeFromRight(
        state.blocks,
        block.id,
        block.trackId,
        block.startBeat,
        snappedLength,
        maxTimelineBeatForState(state),
      ),
    );
    return {...block, lengthBeats: clampedLength};
  }

  if (block.type === 'audio' && block.sourceLengthBeats !== undefined) {
    const offset = block.sourceOffsetBeats ?? 0;
    const sourceLen = block.sourceLengthBeats;
    const maxVisible = sourceLen - offset;
    if (startBeat !== block.startBeat) {
      const clamped = clampResizeFromLeft(
        state.blocks,
        block.id,
        block.trackId,
        startBeat,
        block.startBeat + block.lengthBeats,
      );
      const delta = clamped.startBeat - block.startBeat;
      const nextOffset = Math.max(0, Math.min(sourceLen - 1, offset + delta));
      const nextLength = Math.min(maxVisible - delta, clamped.lengthBeats);
      return {
        ...block,
        startBeat: clamped.startBeat,
        lengthBeats: Math.max(1, nextLength),
        sourceOffsetBeats: nextOffset,
        sourceLengthBeats: sourceLen,
      };
    }

    const clampedLength = clampResizeFromRight(
      state.blocks,
      block.id,
      block.trackId,
      block.startBeat,
      Math.min(lengthBeats, maxVisible),
      maxTimelineBeatForState(state),
    );
    return {...block, lengthBeats: clampedLength, sourceLengthBeats: sourceLen};
  }

  const currentEnd = block.startBeat + block.lengthBeats;
  if (startBeat !== block.startBeat) {
    const clamped = clampResizeFromLeft(state.blocks, block.id, block.trackId, startBeat, currentEnd);
    return {
      ...block,
      startBeat: clamped.startBeat,
      lengthBeats: clamped.lengthBeats,
      notes: block.type === 'midi'
        ? trimNotesToAbsoluteRange(block, clamped.startBeat, currentEnd)
        : block.notes,
    };
  }

  const clampedLength = clampResizeFromRight(
    state.blocks,
    block.id,
    block.trackId,
    block.startBeat,
    lengthBeats,
    maxTimelineBeatForState(state),
  );
  return {...block, lengthBeats: clampedLength};
}

function growRecordingBlockFromElapsed(
  block: DAWBlock,
  playheadBeat: number,
  recordingStartSeconds: number | null,
  playheadSeconds: number,
  bpm: number,
  tempoMap: TempoMapEvent[],
): DAWBlock {
  const elapsedBeats =
    recordingStartSeconds !== null
      ? Math.max(
          0,
          tempoMapBeatAtSeconds(playheadSeconds, bpm, tempoMap) -
            tempoMapBeatAtSeconds(recordingStartSeconds, bpm, tempoMap),
        )
      : Math.max(0, playheadBeat - block.startBeat);
  const endBeat = block.startBeat + elapsedBeats;
  const rawNextLength = Math.max(RECORDING_MIN_VISIBLE_BEATS, endBeat - block.startBeat);
  const visibleLengthCap =
    isLooperOverdubBlock(block) && Number.isFinite(block.looperLengthBeats)
      ? Math.max(RECORDING_MIN_VISIBLE_BEATS, block.looperLengthBeats ?? 0)
      : null;
  const nextLength =
    visibleLengthCap === null ? rawNextLength : Math.min(rawNextLength, visibleLengthCap);

  if (block.type === 'audio') {
    const sourceLength = Math.max(block.sourceLengthBeats ?? nextLength, nextLength);
    return {
      ...block,
      lengthBeats: nextLength,
      sourceLengthBeats: sourceLength,
    };
  }

  return {...block, lengthBeats: nextLength};
}

function safeAudioSourceLengthBeats(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, value)
    : 4;
}

function safeWaveformPeaks(peaks: number[] | undefined): number[] {
  return Array.isArray(peaks)
    ? peaks.filter(peak => Number.isFinite(peak)).map(peak => Math.max(0, Math.min(1, peak)))
    : [];
}

function audioBlockWithReplacementMedia(
  block: DAWBlock,
  media: AudioBlockMediaReplacement,
): DAWBlock {
  const sourceLengthBeats = safeAudioSourceLengthBeats(media.lengthBeats);
  const currentOffset = block.sourceOffsetBeats ?? 0;
  const sourceOffsetBeats = Math.max(
    0,
    Math.min(sourceLengthBeats - 1, currentOffset),
  );
  const availableLength = Math.max(1, sourceLengthBeats - sourceOffsetBeats);

  return {
    ...block,
    name: media.name?.trim() || block.name,
    lengthBeats: Math.max(1, Math.min(block.lengthBeats, availableLength)),
    sourceLengthBeats,
    sourceOffsetBeats,
    audioFilePath: media.audioFilePath,
    absoluteAudioFilePath: media.absoluteAudioFilePath,
    mediaSourceName: media.mediaSourceName ?? block.mediaSourceName,
    isMissingMedia: false,
    missingMediaReason: undefined,
    waveformPeaks: safeWaveformPeaks(media.waveformPeaks),
    durationSeconds: media.durationSeconds,
    sourceSampleRate: media.sourceSampleRate,
    sourceChannelCount: media.sourceChannelCount,
    sourceFileBytes: media.sourceFileBytes,
    sourcePeakAmplitude: media.sourcePeakAmplitude,
    mediaValidationWarning: media.mediaValidationWarning,
    spectrogramRequestId: undefined,
    spectrogramPngPath: undefined,
    spectrogramError: undefined,
  };
}

function blocksShareMediaSource(left: DAWBlock, right: DAWBlock): boolean {
  if (left.type !== 'audio' || right.type !== 'audio') {
    return false;
  }
  return Boolean(
    (left.audioFilePath && left.audioFilePath === right.audioFilePath) ||
    (left.absoluteAudioFilePath && left.absoluteAudioFilePath === right.absoluteAudioFilePath),
  );
}

function compensateFinalizedRecordingBlock(
  block: DAWBlock,
  preference: RecordingLatencyCompensationMs,
  payload: RecordingFinalizePayload | undefined,
  bpm: number,
  tempoMap: TempoMapEvent[],
): DAWBlock {
  const nativeInputMs = finiteLatencyMs(payload?.nativeInputLatencyMs);
  const nativeOutputMs = finiteLatencyMs(payload?.nativeOutputLatencyMs);
  const nativeMs = payload?.recordingLatencyCompensationMs ?? nativeInputMs + nativeOutputMs;
  const normalizedMs = resolvedRecordingLatencyCompensationMs(preference, nativeMs);
  const requestedBeats = recordingLatencyCompensationBeats(
    normalizedMs,
    bpm,
    tempoMap,
    block.startBeat,
  );
  const appliedBeats = Math.min(block.startBeat, requestedBeats);
  if (appliedBeats <= 0) {
    return block;
  }

  return {
    ...block,
    startBeat: block.startBeat - appliedBeats,
    recordingLatencyCompensationMs: normalizedMs,
    recordingLatencyCompensationBeats: appliedBeats,
    recordingLatencyCompensationSource: preference < 0 ? 'native' : 'manual',
    recordingNativeInputLatencyMs: nativeInputMs > 0 ? nativeInputMs : undefined,
    recordingNativeOutputLatencyMs: nativeOutputMs > 0 ? nativeOutputMs : undefined,
  };
}

function finiteLatencyMs(value: unknown): number {
  return Math.max(0, Number.isFinite(value as number) ? value as number : 0);
}

export const useDAWStore = create<DAWStore>((set, get) => ({
  isPlaying: false,
  bpm: 120,
  tempoMap: [],
  meterMap: [],
  isMetronomeEnabled: true,
  recordingCountInBeats: DEFAULT_RECORDING_COUNT_IN_BEATS,
  recordingPreRollBeats: DEFAULT_RECORDING_PRE_ROLL_BEATS,
  isPunchRecordingEnabled: false,
  isLoopRecordingEnabled: false,
  recordingLatencyCompensationMs: DEFAULT_RECORDING_LATENCY_COMPENSATION_MS,
  tracks: [],
  patterns: {},
  blocks: [],
  masterVolumeDb: DEFAULT_MASTER_VOLUME_DB,
  masterPan: DEFAULT_MASTER_PAN,
  snapGrid: DEFAULT_SNAP_GRID,
  isRelativeSnapEnabled: false,
  performanceMode: DEFAULT_PERFORMANCE_MODE,
  looperLengthBars: DEFAULT_LOOPER_LENGTH_BARS,
  isCycleEnabled: false,
  cycleStartBeat: DEFAULT_CYCLE_START_BEAT,
  cycleEndBeat: DEFAULT_CYCLE_END_BEAT,
  selectedBlockId: null,
  selectedBlockIds: [],
  selectedTrackId: null,
  isRecording: false,
  recordingBlockId: null,
  recordingStartSeconds: null,
  recordingWallClockStart: null,
  recordingError: null,
  nativeCountInActive: false,
  playheadBeat: 0,
  playheadSeconds: 0,
  playheadOwnedByUser: true,
  playAwaitingEngine: false,
  playWallClockAnchor: null,
  playStartSeconds: 0,
  syncSource: 'ui',
  timeSignature: {...DEFAULT_TIME_SIGNATURE},
  scale: null,
  chord: null,
  sections: [],
  lyrics: defaultLyricDocument(),
  midiAudition: null,
  liveMidiPreviewByTrack: {},
  liveAudioPreviewByClip: {},
  auditionedRecordingTakeId: null,
  ...createLivePreviewActions(get, set),
  ...createLyricActions(get, set, () => recordHistoryBeforeMutation(get)),
  undo: () => {
    undoArrangement(historyContext(get, set));
  },
  redo: () => {
    redoArrangement(historyContext(get, set));
  },
  canUndo: () => canUndoArrangement(),
  canRedo: () => canRedoArrangement(),
  setIsPlaying: isPlaying => {
    const state = get();
    set({
      isPlaying,
      playheadOwnedByUser: !isPlaying,
      playAwaitingEngine: isPlaying,
      playWallClockAnchor: isPlaying ? Date.now() / 1000 : null,
      playStartSeconds: isPlaying ? state.playheadSeconds : state.playStartSeconds,
      midiAudition: isPlaying ? null : state.midiAudition,
      liveMidiPreviewByTrack: isPlaying ? {} : state.liveMidiPreviewByTrack,
      syncSource: 'ui',
    });
  },
  setMidiAudition: audition => set({midiAudition: audition, syncSource: 'ui'}),
  clearMidiAudition: () => set({midiAudition: null, syncSource: 'ui'}),
  setPlayheadBeat: (beat, options) => {
    const state = get();
    const maxBeat = maxTimelineBeatForState(state);
    const clamped = Math.max(0, Math.min(beat, maxBeat));
    const positionSeconds = tempoMapSecondsAtBeat(clamped, state.bpm, state.tempoMap);

    if (options?.pauseIfPlaying && state.isPlaying) {
      set({
        isPlaying: false,
        playheadOwnedByUser: true,
        playAwaitingEngine: false,
        playWallClockAnchor: null,
        syncSource: 'ui',
      });
    }

    set({
      playheadBeat: clamped,
      playheadSeconds: positionSeconds,
      playheadOwnedByUser: true,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      syncSource: 'ui',
    });

    if (options?.syncTransport !== false) {
      const {isPlaying} = get();
      const payload = buildNativeTransportPayload(isPlaying, clamped, positionSeconds);
      void sendNativeAudioCommandAsync('transport_play', payload);
    }
  },
  setBpm: bpm => {
    const normalized = normalizeTempoBpm(bpm);
    if (get().bpm === normalized) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({bpm: normalized, syncSource: 'ui'});
  },
  setTempoMapEvent: (beat, bpm, ramp) => {
    const next = upsertTempoMapEvent(get().tempoMap, beat, bpm, ramp);
    if (jsonEqual(get().tempoMap, next)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({tempoMap: next, syncSource: 'ui'});
  },
  removeTempoMapEventAtBeat: beat => {
    const next = removeTempoMapEventAtBeat(get().tempoMap, beat);
    if (jsonEqual(get().tempoMap, next)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({tempoMap: next, syncSource: 'ui'});
  },
  setMeterMapEvent: (beat, timeSignature) => {
    const next = upsertMeterMapEvent(get().meterMap, beat, normalizeTimeSignature(timeSignature));
    if (jsonEqual(get().meterMap, next)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({meterMap: next, syncSource: 'ui'});
  },
  removeMeterMapEventAtBeat: beat => {
    const next = removeMeterMapEventAtBeat(get().meterMap, beat);
    if (jsonEqual(get().meterMap, next)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({meterMap: next, syncSource: 'ui'});
  },
  setMetronomeEnabled: enabled => set({isMetronomeEnabled: enabled, syncSource: 'ui'}),
  setRecordingCountInBeats: beats => {
    const normalized = normalizeRecordingCountInBeats(beats);
    if (get().recordingCountInBeats === normalized) {
      return;
    }
    set({recordingCountInBeats: normalized, syncSource: 'ui'});
  },
  setRecordingPreRollBeats: beats => {
    const normalized = normalizeRecordingPreRollBeats(beats);
    if (get().recordingPreRollBeats === normalized) {
      return;
    }
    set({recordingPreRollBeats: normalized, syncSource: 'ui'});
  },
  setPunchRecordingEnabled: enabled => {
    if (get().isPunchRecordingEnabled === enabled) {
      return;
    }
    set({isPunchRecordingEnabled: enabled, syncSource: 'ui'});
  },
  setLoopRecordingEnabled: enabled => {
    if (get().isLoopRecordingEnabled === enabled) {
      return;
    }
    set({isLoopRecordingEnabled: enabled, syncSource: 'ui'});
  },
  setRecordingLatencyCompensationMs: milliseconds => {
    const normalized = normalizeRecordingLatencyCompensationMs(milliseconds);
    if (get().recordingLatencyCompensationMs === normalized) {
      return;
    }
    set({recordingLatencyCompensationMs: normalized, syncSource: 'ui'});
  },
  addTrackFromTemplate: (templateId, options) => {
    recordHistoryBeforeMutation(get);
    const state = get();
    const laneIndex = state.tracks.length;
    const track = createTrackFromTemplate(templateId, laneIndex, options);
    const colorIndex = laneIndex;

    let patternBlock: DAWBlock | null = null;
    let newPattern: DrumPattern | null = null;

    if (templateId === 'drum_machine') {
      newPattern = createEmptyPattern('Pattern A');
      patternBlock = createDefaultDrumPatternBlock(
        track.id,
        colorIndex,
        state.playheadBeat,
        newPattern.id,
        newPattern.name,
      );
    }

    set(prev => ({
      tracks: [...prev.tracks, track],
      patterns: newPattern
        ? {...prev.patterns, [newPattern.id]: newPattern}
        : prev.patterns,
      blocks: patternBlock ? [...prev.blocks, patternBlock] : prev.blocks,
      selectedTrackId: selectTrackOnAdd(track) ? track.id : prev.selectedTrackId,
      selectedBlockId: patternBlock ? patternBlock.id : prev.selectedBlockId,
      selectedBlockIds: patternBlock ? [patternBlock.id] : prev.selectedBlockIds,
      syncSource: 'ui',
    }));
    refreshPlaybackAndInstruments();
    if (patternBlock) {
      upsertBlockForEngine(patternBlock);
    }
  },
  addSoftwareInstrumentTrack: () => {
    get().addTrackFromTemplate('virtual_instrument', {instrumentId: SYNTH_LEAD.id});
  },
  addVoiceAudioTrack: () => {
    get().addTrackFromTemplate('voice_audio');
  },
  addDrumMachineTrack: () => {
    get().addTrackFromTemplate('drum_machine');
  },
  moveTrack: (trackId, direction) => {
    const current = get();
    const nextTracks = moveActiveTrack(current.tracks, trackId, direction);
    if (jsonEqual(current.tracks.map(track => track.id), nextTracks.map(track => track.id))) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({tracks: nextTracks, syncSource: 'ui'});
  },
  setTrackArchived: (trackId, isArchived) => {
    const current = get();
    const nextTracks = setTrackArchiveState(current.tracks, trackId, isArchived);
    if (jsonEqual(current.tracks, nextTracks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      const selectedBlockIds = state.selectedBlockIds.filter(blockId => {
        const block = state.blocks.find(item => item.id === blockId);
        return block ? trackIsVisible(nextTracks, block.trackId) : false;
      });
      const selectedBlockId =
        state.selectedBlockId && selectedBlockIds.includes(state.selectedBlockId)
          ? state.selectedBlockId
          : selectedBlockIds[selectedBlockIds.length - 1] ?? null;
      const recordingBlock = state.recordingBlockId
        ? state.blocks.find(block => block.id === state.recordingBlockId)
        : null;
      const recordingArchived = Boolean(
        recordingBlock && !trackIsVisible(nextTracks, recordingBlock.trackId),
      );
      const selectedTrackVisible =
        state.selectedTrackId && trackIsVisible(nextTracks, state.selectedTrackId);

      return {
        tracks: nextTracks,
        selectedTrackId: selectedTrackVisible
          ? state.selectedTrackId
          : selectedBlockId
            ? state.blocks.find(block => block.id === selectedBlockId)?.trackId ?? null
            : activeTracks(nextTracks)[0]?.id ?? null,
        selectedBlockId,
        selectedBlockIds,
        isRecording: recordingArchived ? false : state.isRecording,
        recordingBlockId: recordingArchived ? null : state.recordingBlockId,
        recordingStartSeconds: recordingArchived ? null : state.recordingStartSeconds,
        recordingWallClockStart: recordingArchived ? null : state.recordingWallClockStart,
        syncSource: 'ui',
      };
    });
  },
  setTrackDisabled: (trackId, isDisabled) => {
    const current = get();
    const nextTracks = setTrackDisabledState(current.tracks, trackId, isDisabled);
    if (jsonEqual(current.tracks, nextTracks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      const recordingBlock = state.recordingBlockId
        ? state.blocks.find(block => block.id === state.recordingBlockId)
        : null;
      const recordingDisabled = Boolean(isDisabled && recordingBlock?.trackId === trackId);

      return {
        tracks: nextTracks,
        isRecording: recordingDisabled ? false : state.isRecording,
        recordingBlockId: recordingDisabled ? null : state.recordingBlockId,
        recordingStartSeconds: recordingDisabled ? null : state.recordingStartSeconds,
        recordingWallClockStart: recordingDisabled ? null : state.recordingWallClockStart,
        syncSource: 'ui',
      };
    });
  },
  setTrackFrozen: (trackId, isFrozen) => {
    const current = get();
    const nextTracks = setTrackFrozenState(current.tracks, trackId, isFrozen);
    if (jsonEqual(current.tracks, nextTracks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      const recordingBlock = state.recordingBlockId
        ? state.blocks.find(block => block.id === state.recordingBlockId)
        : null;
      const recordingFrozen = Boolean(isFrozen && recordingBlock?.trackId === trackId);

      return {
        tracks: nextTracks,
        isRecording: recordingFrozen ? false : state.isRecording,
        recordingBlockId: recordingFrozen ? null : state.recordingBlockId,
        recordingStartSeconds: recordingFrozen ? null : state.recordingStartSeconds,
        recordingWallClockStart: recordingFrozen ? null : state.recordingWallClockStart,
        syncSource: 'ui',
      };
    });
  },
  setTrackFolderName: (trackId, folderName) => {
    const normalized = normalizeTrackOrganizationLabel(folderName);
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || track.trackFolderName === normalized) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId
          ? trackWithOrganizationLabel(item, 'trackFolderName', normalized)
          : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackGroupName: (trackId, groupName) => {
    const normalized = normalizeTrackOrganizationLabel(groupName);
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || track.trackGroupName === normalized) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId
          ? trackWithOrganizationLabel(item, 'trackGroupName', normalized)
          : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackHeightScale: (trackId, trackHeightScale) => {
    const current = get();
    const nextTracks = setTrackHeightScaleState(current.tracks, trackId, trackHeightScale);
    if (jsonEqual(current.tracks, nextTracks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({tracks: nextTracks, syncSource: 'ui'});
  },
  setTrackInstrument: (trackId, instrumentId, presetId) => {
    const currentTrack = get().tracks.find(track => track.id === trackId);
    if (!currentTrack || currentTrack.type === 'voice_audio') {
      return;
    }
    const definition = instrumentForTrack(currentTrack.type, instrumentId);
    const resolvedPreset =
      presetId && definition.presets.some(p => p.id === presetId)
        ? presetId
        : definition.defaultPresetId;
    if (
      currentTrack.instrumentId === instrumentId &&
      currentTrack.presetId === resolvedPreset
    ) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track => {
        if (track.id !== trackId || track.type === 'voice_audio') {
          return track;
        }
        return {...track, instrumentId, presetId: resolvedPreset, samplerRegions: undefined};
      }),
      syncSource: 'ui',
    }));
    refreshPlaybackAndInstruments();
  },
  removeTrack: trackId => {
    if (!get().tracks.some(track => track.id === trackId)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      const nextMidi = {...state.liveMidiPreviewByTrack};
      delete nextMidi[trackId];
      const nextBlocks = state.blocks.filter(block => block.trackId !== trackId);
      const nextTracks = removeTrackRoutingTarget(
        state.tracks.filter(track => track.id !== trackId),
        trackId,
      );
      const selectedBlockIds = state.selectedBlockIds.filter(id =>
        nextBlocks.some(block => block.id === id),
      );
      const selectedBlockId = state.selectedBlockId
        && nextBlocks.some(block => block.id === state.selectedBlockId)
          ? state.selectedBlockId
          : selectedBlockIds[selectedBlockIds.length - 1] ?? null;
      return {
        tracks: nextTracks,
        blocks: nextBlocks,
        selectedBlockId,
        selectedBlockIds,
        recordingBlockId:
          state.blocks.find(block => block.id === state.recordingBlockId)?.trackId === trackId
            ? null
            : state.recordingBlockId,
        recordingStartSeconds:
          state.blocks.find(block => block.id === state.recordingBlockId)?.trackId === trackId
            ? null
            : state.recordingStartSeconds,
        selectedTrackId:
          state.selectedTrackId === trackId
            ? defaultSelectedTrackId(
                nextTracks,
                selectedBlockId,
                nextBlocks,
              )
            : state.selectedTrackId,
        liveMidiPreviewByTrack: nextMidi,
        syncSource: 'ui',
      };
    });
    refreshPlaybackAndInstruments();
  },
  toggleTrackMute: trackId => {
    if (!get().tracks.some(track => track.id === trackId)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track =>
        track.id === trackId ? {...track, isMuted: !track.isMuted} : track,
      ),
      syncSource: 'ui',
    }));
  },
  toggleTrackSolo: trackId => {
    if (!get().tracks.some(track => track.id === trackId)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track =>
        track.id === trackId ? {...track, isSolo: !track.isSolo} : track,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackInputMonitoring: (trackId, enabled) => {
    const track = get().tracks.find(item => item.id === trackId);
    if (
      !track ||
      isTrackFrozen(track) ||
      track.type !== 'voice_audio' ||
      track.isInputMonitoringEnabled === enabled
    ) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, isInputMonitoringEnabled: enabled} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackAutomationMode: (trackId, mode) => {
    const normalized = normalizeAutomationMode(mode);
    const track = get().tracks.find(item => item.id === trackId);
    if (
      !track ||
      (
        normalizeAutomationMode(track.automationMode) === normalized &&
        (track.automationLanes?.length ?? 0) > 0
      )
    ) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId
          ? {
              ...item,
              automationMode: normalized,
              automationLanes: item.automationLanes?.length
                ? item.automationLanes
                : defaultTrackAutomationLanes(),
            }
          : item,
      ),
      syncSource: 'ui',
    }));
  },
  upsertTrackAutomationLane: (trackId, lane) => {
    const track = get().tracks.find(item => item.id === trackId);
    if (!track) {
      return;
    }

    const nextLanes = upsertAutomationLane(track.automationLanes, lane);
    if (jsonEqual(track.automationLanes ?? [], nextLanes)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, automationLanes: nextLanes} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackAutomationPoint: (trackId, targetType, parameterId, beat, value) => {
    const track = get().tracks.find(item => item.id === trackId);
    const normalizedParameterId = parameterId.trim();
    if (!track || normalizedParameterId.length === 0) {
      return;
    }

    const nextLanes = upsertAutomationPoint(
      track.automationLanes,
      {targetType, parameterId: normalizedParameterId},
      {
        beat,
        value: normalizeAutomationPointValue(targetType, normalizedParameterId, value),
      },
    );
    if (jsonEqual(track.automationLanes ?? [], nextLanes)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, automationLanes: nextLanes} : item,
      ),
      syncSource: 'ui',
    }));
  },
  removeTrackAutomationPoint: (trackId, targetType, parameterId, beat) => {
    const track = get().tracks.find(item => item.id === trackId);
    const normalizedParameterId = parameterId.trim();
    if (!track || normalizedParameterId.length === 0) {
      return;
    }

    const nextLanes = removeAutomationPoint(
      track.automationLanes,
      {targetType, parameterId: normalizedParameterId},
      beat,
    );
    if (jsonEqual(track.automationLanes ?? [], nextLanes)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, automationLanes: nextLanes} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackVolumeDb: (trackId, volumeDb) => {
    const clamped = clampTrackVolumeDb(volumeDb);
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || normalizeTrackMix(track).volumeDb === clamped) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, volumeDb: clamped} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackPan: (trackId, pan) => {
    const clamped = clampTrackPan(pan);
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || normalizeTrackMix(track).pan === clamped) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, pan: clamped} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackGainDb: (trackId, gainDb) => {
    const clamped = clampTrackGainDb(gainDb);
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || normalizeTrackMix(track).gainDb === clamped) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, gainDb: clamped} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackRoutingRole: (trackId, role) => {
    const track = get().tracks.find(item => item.id === trackId);
    if (!track) {
      return;
    }

    const normalized = normalizeTrackRoutingRole(role);
    const currentRole = normalizeTrackRoutingRole(track.routingRole);
    const nextStoredRole = storedTrackRoutingRole(normalized);
    if (currentRole === normalized && track.routingRole === nextStoredRole) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item => {
        if (item.id !== trackId) {
          return item;
        }
        const next = {...item};
        if (nextStoredRole) {
          next.routingRole = nextStoredRole;
        } else {
          delete next.routingRole;
        }
        return next;
      }),
      syncSource: 'ui',
    }));
  },
  setTrackOutput: (trackId, outputTrackId) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    if (!track) {
      return;
    }

    const requestedTarget = outputTrackId?.trim() || MASTER_OUTPUT_ID;
    const normalized = normalizeTrackOutputTarget(
      {...track, routingOutputTrackId: requestedTarget},
      current.tracks,
    );
    const currentTarget = normalizeTrackOutputTarget(track, current.tracks);
    const nextStoredTarget = routingOutputForState(normalized);
    if (currentTarget === normalized && track.routingOutputTrackId === nextStoredTarget) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item => {
        if (item.id !== trackId) {
          return item;
        }
        const next = {...item};
        if (nextStoredTarget) {
          next.routingOutputTrackId = nextStoredTarget;
        } else {
          delete next.routingOutputTrackId;
        }
        return next;
      }),
      syncSource: 'ui',
    }));
  },
  setTrackSend: (trackId, targetTrackId, gainDb, preFader) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    const targetId = targetTrackId.trim();
    if (!track || !targetId || targetId === trackId || !current.tracks.some(item => item.id === targetId)) {
      return;
    }

    const existingSends = normalizeTrackRoutingSends(track, current.tracks)
      .filter(send => send.targetTrackId !== targetId);
    const nextSends = normalizeTrackRoutingSends(
      {
        ...track,
        routingSends: [
          ...existingSends,
          {targetTrackId: targetId, gainDb, preFader: preFader === true},
        ],
      },
      current.tracks,
    );
    if (jsonEqual(normalizeTrackRoutingSends(track, current.tracks), nextSends)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, routingSends: routingSendsForState(nextSends)} : item,
      ),
      syncSource: 'ui',
    }));
  },
  removeTrackSend: (trackId, targetTrackId) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    const targetId = targetTrackId.trim();
    if (!track || !targetId) {
      return;
    }

    const nextSends = normalizeTrackRoutingSends(track, current.tracks)
      .filter(send => send.targetTrackId !== targetId);
    if (jsonEqual(normalizeTrackRoutingSends(track, current.tracks), nextSends)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? {...item, routingSends: routingSendsForState(nextSends)} : item,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackSidechainSource: (trackId, sourceTrackId) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    if (!track) {
      return;
    }

    const requestedSource = sourceTrackId?.trim() || undefined;
    const normalized = normalizeTrackSidechainSource(
      {...track, routingSidechainSourceTrackId: requestedSource},
      current.tracks,
    );
    const currentSource = normalizeTrackSidechainSource(track, current.tracks);
    if (currentSource === normalized && track.routingSidechainSourceTrackId === normalized) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(item =>
        item.id === trackId ? trackWithSidechainSource(item, normalized) : item,
      ),
      syncSource: 'ui',
    }));
  },
  setMasterVolumeDb: volumeDb => {
    const clamped = clampTrackVolumeDb(volumeDb);
    if (get().masterVolumeDb === clamped) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({masterVolumeDb: clamped, syncSource: 'ui'});
  },
  setMasterPan: pan => {
    const clamped = clampTrackPan(pan);
    if (get().masterPan === clamped) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({masterPan: clamped, syncSource: 'ui'});
  },
  setSnapGrid: snapGrid => {
    const normalized = normalizeSnapGrid(snapGrid);
    if (get().snapGrid === normalized) {
      return;
    }

    set({snapGrid: normalized, syncSource: 'ui'});
  },
  setRelativeSnapEnabled: enabled => {
    if (get().isRelativeSnapEnabled === enabled) {
      return;
    }

    set({isRelativeSnapEnabled: enabled, syncSource: 'ui'});
  },
  setPerformanceMode: mode => {
    const normalized = normalizePerformanceMode(mode);
    if (get().performanceMode === normalized) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({performanceMode: normalized, syncSource: 'ui'});
  },
  setLooperLengthBars: bars => {
    const normalized = normalizeLooperLengthBars(bars);
    if (get().looperLengthBars === normalized) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({looperLengthBars: normalized, syncSource: 'ui'});
  },
  setCycleEnabled: enabled => {
    if (get().isCycleEnabled === enabled) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({isCycleEnabled: enabled, syncSource: 'ui'});
  },
  setCycleRange: (startBeat, endBeat, options) => {
    const range = normalizeCycleRange(startBeat, endBeat);
    const nextEnabled = options?.enable ?? get().isCycleEnabled;
    const state = get();
    if (
      state.cycleStartBeat === range.startBeat &&
      state.cycleEndBeat === range.endBeat &&
      state.isCycleEnabled === nextEnabled
    ) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({
      isCycleEnabled: nextEnabled,
      cycleStartBeat: range.startBeat,
      cycleEndBeat: range.endBeat,
      syncSource: 'ui',
    });
  },
  setTrackPreset: (trackId, presetId) => {
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || track.presetId === presetId) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track =>
        track.id === trackId ? {...track, presetId} : track,
      ),
      syncSource: 'ui',
    }));
  },
  setTrackLocked: (trackId, isLocked) => {
    const track = get().tracks.find(item => item.id === trackId);
    if (!track || track.isLocked === isLocked) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track =>
        track.id === trackId ? {...track, isLocked} : track,
      ),
      syncSource: 'ui',
    }));
  },
  setTimeSignature: timeSignature => {
    const normalized = normalizeTimeSignature(timeSignature);
    if (jsonEqual(get().timeSignature, normalized)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({timeSignature: normalized, syncSource: 'ui'});
  },
  setScale: scale => {
    if (jsonEqual(get().scale, scale)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({scale, syncSource: 'ui'});
  },
  setChord: chord => {
    if (jsonEqual(get().chord, chord)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({chord, syncSource: 'ui'});
  },
  setSections: sections => {
    if (jsonEqual(get().sections, sections)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({sections, syncSource: 'ui'});
  },
  toggleTrackRecordArm: trackId => {
    const track = get().tracks.find(track => track.id === trackId);
    if (!track || isTrackFrozen(track)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: state.tracks.map(track =>
        track.id === trackId
          ? {...track, isRecordArmed: !track.isRecordArmed}
          : {...track, isRecordArmed: false},
      ),
      syncSource: 'ui',
    }));
  },
  selectTrack: trackId =>
    set({
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedTrackId: trackId,
      syncSource: 'ui',
    }),
  setIsRecording: isRecording =>
    set(state => ({
      isRecording,
      recordingStartSeconds: isRecording ? state.recordingStartSeconds : null,
      recordingWallClockStart: isRecording ? state.recordingWallClockStart : null,
      syncSource: 'ui',
    })),
  startRecordingSession: (trackId, playheadBeat) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    if (!track || track.type === 'drum_machine') {
      return null;
    }

    const colorIndex = current.tracks.findIndex(item => item.id === trackId);
    const startBeat = Math.max(0, playheadBeat);

    const recordingBlock =
      track.type === 'voice_audio'
        ? createRecordingAudioBlock(trackId, Math.max(0, colorIndex), startBeat)
        : createRecordingMidiBlock(trackId, Math.max(0, colorIndex), startBeat);
    const block = prepareLooperRecordingBlock(recordingBlock, {
      blocks: current.blocks,
      performanceMode: current.performanceMode,
      looperLengthBars: current.looperLengthBars,
      timeSignature: current.timeSignature,
    });
    delete block.isMuted;
    delete block.recordingTakeActive;

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: [...state.blocks, block],
      selectedBlockId: block.id,
      selectedBlockIds: [block.id],
      recordingBlockId: block.id,
      recordingStartSeconds: null,
      recordingWallClockStart: null,
      selectedTrackId: selectTrackOnAdd(track) ? trackId : state.selectedTrackId,
      isRecording: false,
      recordingError: null,
      syncSource: 'ui',
    }));

    return block.id;
  },
  activateRecordingSession: () => {
    const recordingStartSeconds = get().playheadSeconds;
    set({
      isRecording: true,
      recordingStartSeconds,
      recordingWallClockStart: Date.now() / 1000,
      recordingError: null,
      syncSource: 'ui',
    });
  },
  abortRecordingSession: message =>
    set(state => {
      const recordingBlockId = state.recordingBlockId;
      const recordingBlock = recordingBlockId
        ? state.blocks.find(block => block.id === recordingBlockId)
        : null;
      const nextAudio = {...state.liveAudioPreviewByClip};
      if (recordingBlockId) {
        delete nextAudio[recordingBlockId];
      }
      const nextMidi = {...state.liveMidiPreviewByTrack};
      if (recordingBlock) {
        delete nextMidi[recordingBlock.trackId];
      }
      return {
        blocks: recordingBlockId
          ? state.blocks.filter(block => block.id !== recordingBlockId)
          : state.blocks,
        isRecording: false,
        recordingBlockId: null,
        recordingStartSeconds: null,
        recordingWallClockStart: null,
        recordingError: message,
        liveAudioPreviewByClip: nextAudio,
        liveMidiPreviewByTrack: nextMidi,
        syncSource: 'ui',
      };
    }),
  clearRecordingError: () => set({recordingError: null, syncSource: 'ui'}),
  finalizeRecordingSession: payload => {
    const recordingBlockId = get().recordingBlockId;
    if (!recordingBlockId) {
      set({isRecording: false, recordingStartSeconds: null, syncSource: 'ui'});
      return;
    }

    const notes = Array.isArray(payload) ? payload : payload?.notes ?? [];
    const audioPayload = Array.isArray(payload) ? undefined : payload;
    const hasAudioTake = Boolean(audioPayload?.audioFilePath);
    const hasMidiTake = notes.length > 0;

    set(state => {
      const recordingBlock = state.blocks.find(block => block.id === recordingBlockId);
      if (!recordingBlock) {
        return {
          isRecording: false,
          recordingBlockId: null,
          recordingStartSeconds: null,
          recordingWallClockStart: null,
          syncSource: 'ui',
        };
      }

      if (recordingBlock.type === 'audio' && !hasAudioTake) {
        return {
          blocks: state.blocks.filter(block => block.id !== recordingBlockId),
          isRecording: false,
          recordingBlockId: null,
          recordingStartSeconds: null,
          recordingWallClockStart: null,
          recordingError: state.recordingError ?? 'Voice recording produced no audio file.',
          syncSource: 'ui',
        };
      }

      if (recordingBlock.type === 'midi' && !hasMidiTake) {
        return {
          blocks: state.blocks.filter(block => block.id !== recordingBlockId),
          isRecording: false,
          recordingBlockId: null,
          recordingStartSeconds: null,
          recordingWallClockStart: null,
          recordingError: state.recordingError ?? 'MIDI recording captured no notes.',
          syncSource: 'ui',
        };
      }

      const isLooperOverdub = isLooperOverdubBlock(recordingBlock);
      const latencyPreference = isLooperOverdub
        ? DEFAULT_RECORDING_LATENCY_COMPENSATION_MS
        : state.recordingLatencyCompensationMs;
      let blocks = state.blocks.map(block => {
        if (block.id !== recordingBlockId) {
          return block;
        }

        if (block.type === 'audio' && audioPayload?.audioFilePath) {
          const lengthBeats = resolveAudioRecordedLengthBeats(block, audioPayload);
          return compensateFinalizedRecordingBlock({
            ...block,
            name: isLooperOverdub ? looperOverdubName(block) : 'Recorded',
            lengthBeats,
            sourceLengthBeats: lengthBeats,
            sourceOffsetBeats: 0,
            audioFilePath: audioPayload.audioFilePath,
            absoluteAudioFilePath: audioPayload.absoluteAudioFilePath,
            waveformPeaks: audioPayload.waveformPeaks ?? [],
            durationSeconds: audioPayload.durationSeconds,
            sourcePeakAmplitude: audioPayload.sourcePeakAmplitude,
          }, latencyPreference, audioPayload, state.bpm, state.tempoMap);
        }

        const lengthBeats = recordingClipLengthBeats(block, notes);

        if (block.type === 'midi') {
          const lengthFromNotes = recordingClipLengthBeats(block, notes);
          const lengthBeats =
            notes.length > 0 ? lengthFromNotes : Math.max(lengthFromNotes, block.lengthBeats);
          return compensateFinalizedRecordingBlock({
            ...block,
            notes,
            name: isLooperOverdub ? looperOverdubName(block) : 'Recorded',
            lengthBeats,
          }, latencyPreference, audioPayload, state.bpm, state.tempoMap);
        }

        return compensateFinalizedRecordingBlock({
          ...block,
          name: isLooperOverdub ? looperOverdubName(block) : 'Recorded',
          lengthBeats,
        }, latencyPreference, audioPayload, state.bpm, state.tempoMap);
      });

      const isLoopRecording =
        !isLooperOverdub &&
        (recordingBlock.type === 'midi' || recordingBlock.type === 'audio') &&
        (state.isCycleEnabled || state.isLoopRecordingEnabled) &&
        !state.isPunchRecordingEnabled &&
        state.cycleEndBeat > state.cycleStartBeat;

      if (isLooperOverdub) {
        blocks = blocks.flatMap(block =>
          block.id === recordingBlockId ? finalizedLooperOverdubSegments(block) : [block],
        );
      } else if (isLoopRecording) {
        blocks = blocks.flatMap(block =>
          block.id === recordingBlockId
            ? finalizedLoopRecordingTakes(block, {
                cycleStartBeat: state.cycleStartBeat,
                cycleEndBeat: state.cycleEndBeat,
              })
            : [block],
        );
        if (recordingBlock.type === 'audio') {
          const groupId = blocks.find(block =>
            block.recordingTakeId === recordingBlockId || block.id === recordingBlockId,
          )?.recordingTakeGroupId;
          if (groupId) {
            blocks = blocksWithDefaultRecordingCompOutput(blocks, groupId);
          }
        }
      } else {
        blocks = blocksWithFinalizedRecordingTake(blocks, recordingBlockId);
      }

      const nextAudio = {...state.liveAudioPreviewByClip};
      delete nextAudio[recordingBlockId];
      const nextMidi = {...state.liveMidiPreviewByTrack};
      delete nextMidi[recordingBlock.trackId];

      return {
        blocks,
        isRecording: false,
        isPlaying: false,
        playheadOwnedByUser: true,
        playAwaitingEngine: false,
        playWallClockAnchor: null,
        recordingBlockId: null,
        recordingStartSeconds: null,
        recordingWallClockStart: null,
        recordingError: null,
        liveAudioPreviewByClip: nextAudio,
        liveMidiPreviewByTrack: nextMidi,
        syncSource: 'ui',
      };
    });

    const committedAudioPath = audioPayload?.audioFilePath;
    if (committedAudioPath?.startsWith('recordings/')) {
      get().requestSpectrogramForRecordedClip(recordingBlockId, committedAudioPath);
    }
  },
  requestSpectrogramForRecordedClip: (clipId, audioFilePath) => {
    if (!audioFilePath.startsWith('recordings/')) {
      return;
    }

    const request = buildRecordedWavSpectrogramRequest(audioFilePath);
    const {started} = dispatchRenderSpectrogram(request);
    if (!started) {
      set(state => ({
        blocks: state.blocks.map(block =>
          block.id === clipId
            ? {...block, spectrogramError: 'Spectrogram render could not start.'}
            : block,
        ),
        syncSource: 'ui',
      }));
      return;
    }

    set(state => ({
      blocks: state.blocks.map(block =>
        block.id === clipId
          ? {
              ...block,
              spectrogramRequestId: request.requestId,
              spectrogramPngPath: undefined,
              spectrogramError: undefined,
            }
          : block,
      ),
      syncSource: 'ui',
    }));
  },
  applySpectrogramReady: payload => {
    set(state => ({
      blocks: state.blocks.map(block => {
        if (block.spectrogramRequestId !== payload.requestId) {
          return block;
        }

        if (payload.ok) {
          return {
            ...block,
            spectrogramRequestId: undefined,
            spectrogramPngPath: payload.pngPath,
            spectrogramError: undefined,
          };
        }

        return {
          ...block,
          spectrogramRequestId: undefined,
          spectrogramError: payload.error ?? 'Spectrogram render failed.',
        };
      }),
      syncSource: 'ui',
    }));
  },
  addBlock: block => {
    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: [...state.blocks, block],
      syncSource: 'ui',
    }));
  },
  addTrackWithBlock: (track, block) => {
    recordHistoryBeforeMutation(get);
    set(state => ({
      tracks: [...state.tracks, track],
      blocks: [...state.blocks, block],
      selectedTrackId: block.trackId,
      selectedBlockId: block.id,
      selectedBlockIds: [block.id],
      syncSource: 'ui',
    }));
  },
  createMidiClipAtBeat: (trackId, beat, lengthBeats) => {
    const current = get();
    const track = current.tracks.find(item => item.id === trackId);
    if (!track || track.type !== 'software_instrument') {
      return null;
    }

    const colorIndex = current.tracks.findIndex(item => item.id === trackId);
    const beatsPerBar = beatsPerBarForTimeSignature(current.timeSignature);
    const safeBeat = Number.isFinite(beat) ? Math.max(0, beat) : current.playheadBeat;
    const startBeat = Math.floor(safeBeat / beatsPerBar) * beatsPerBar;
    const defaultLength = beatsPerBar * 4;
    const safeLength =
      typeof lengthBeats === 'number' && Number.isFinite(lengthBeats) && lengthBeats > 0
        ? lengthBeats
        : defaultLength;
    const block = createMidiClipBlock(trackId, Math.max(0, colorIndex), startBeat, safeLength);

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: [...state.blocks, block],
      selectedBlockId: block.id,
      selectedBlockIds: [block.id],
      selectedTrackId: trackId,
      syncSource: 'ui',
    }));
    return block.id;
  },
  moveBlock: (blockId, startBeat, trackId) => {
    const state = get();
    const block = state.blocks.find(item => item.id === blockId);
    if (!block) {
      return;
    }

    const targetTrackId = trackId ?? block.trackId;
    const clampedStart = clampMoveStartBeat(
      state.blocks,
      blockId,
      targetTrackId,
      block.lengthBeats,
      startBeat,
      maxTimelineBeatForState(state),
    );
    if (clampedStart === block.startBeat && targetTrackId === block.trackId) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(current => ({
      blocks: current.blocks.map(item =>
        item.id === blockId ? {...item, startBeat: clampedStart, trackId: targetTrackId} : item,
      ),
      syncSource: 'ui',
    }));
  },
  resizeBlock: (blockId, startBeat, lengthBeats) => {
    const state = get();
    const block = state.blocks.find(item => item.id === blockId);
    if (!block) {
      return;
    }

    const nextBlock = resizedBlockForState(state, block, startBeat, lengthBeats);
    if (timingFieldsEqual(block, nextBlock)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(current => ({
      blocks: current.blocks.map(item => (item.id === blockId ? nextBlock : item)),
      syncSource: 'ui',
    }));
  },
  updateBlock: (blockId, updates) => {
    const block = get().blocks.find(item => item.id === blockId);
    if (!block || jsonEqual(
      updates,
      Object.fromEntries(Object.keys(updates).map(key => [key, block[key as keyof DAWBlock]])),
    )) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block => (block.id === blockId ? {...block, ...updates} : block)),
      syncSource: 'ui',
    }));
  },
  setMediaSourceName: (blockId, name) => {
    const sourceBlock = get().blocks.find(block => block.id === blockId);
    const trimmed = name.trim();
    if (
      !sourceBlock ||
      sourceBlock.type !== 'audio' ||
      (!sourceBlock.audioFilePath && !sourceBlock.absoluteAudioFilePath) ||
      trimmed.length === 0
    ) {
      return;
    }

    const nextBlocks = get().blocks.map(block =>
      blocksShareMediaSource(block, sourceBlock) ? {...block, mediaSourceName: trimmed} : block,
    );
    if (jsonEqual(get().blocks, nextBlocks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({blocks: nextBlocks, syncSource: 'ui'});
  },
  setBlockLocked: (blockId, isLocked) => {
    const block = get().blocks.find(item => item.id === blockId);
    if (!block || block.isLocked === isLocked) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block =>
        block.id === blockId ? {...block, isLocked} : block,
      ),
      syncSource: 'ui',
    }));
  },
  compLooperLayer: layerId => {
    const current = get();
    const nextBlocks = blocksAfterLooperComp(current.blocks, layerId);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({
      blocks: nextBlocks,
      syncSource: 'ui',
    });
  },
  compRecordingTake: takeId => {
    const current = get();
    const take = current.blocks.find(block => block.recordingTakeId === takeId || block.id === takeId);
    const nextBlocks =
      take?.type === 'audio' && take.recordingTakeGroupId
        ? materializeRecordingCompOutput(
            current.blocks,
            take.recordingTakeGroupId,
            replaceCompRange(
              current.blocks,
              take.recordingTakeGroupId,
              take.recordingTakeId ?? take.id,
              take.startBeat,
              take.startBeat + take.lengthBeats,
            ),
          )
        : blocksAfterRecordingTakeComp(current.blocks, takeId);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({
      blocks: nextBlocks,
      syncSource: 'ui',
    });
  },
  setRecordingCompRange: (groupId, takeId, startBeat, endBeat) => {
    const current = get();
    const segments = replaceCompRange(current.blocks, groupId, takeId, startBeat, endBeat);
    const nextBlocks = materializeRecordingCompOutput(current.blocks, groupId, segments);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({
      blocks: nextBlocks,
      auditionedRecordingTakeId: null,
      syncSource: 'ui',
    });
  },
  selectRecordingCompTake: (groupId, takeId) => {
    const current = get();
    const segments = fullTakeCompSegmentsForGroup(current.blocks, groupId, takeId);
    const nextBlocks = materializeRecordingCompOutput(current.blocks, groupId, segments);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({
      blocks: nextBlocks,
      auditionedRecordingTakeId: null,
      syncSource: 'ui',
    });
  },
  setAuditionedRecordingTake: takeId => {
    if (get().auditionedRecordingTakeId === takeId) {
      return;
    }
    set({auditionedRecordingTakeId: takeId, syncSource: 'ui'});
  },
  switchRecordingCompVersion: (groupId, versionId) => {
    const current = get();
    const nextBlocks = switchRecordingCompVersionBlocks(current.blocks, groupId, versionId);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({blocks: nextBlocks, auditionedRecordingTakeId: null, syncSource: 'ui'});
  },
  duplicateRecordingCompVersion: groupId => {
    const current = get();
    const nextBlocks = duplicateRecordingCompVersionBlocks(current.blocks, groupId);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({blocks: nextBlocks, syncSource: 'ui'});
  },
  renameRecordingCompVersion: (groupId, versionId, name) => {
    const current = get();
    const nextBlocks = renameRecordingCompVersionBlocks(current.blocks, groupId, versionId, name);
    if (jsonEqual(current.blocks, nextBlocks)) {
      return;
    }
    recordHistoryBeforeMutation(get);
    set({blocks: nextBlocks, syncSource: 'ui'});
  },
  flattenRecordingCompGroup: (groupId, block) => {
    const current = get();
    const groupIds = new Set(
      current.blocks
        .filter(item =>
          item.recordingTakeGroupId === groupId || item.recordingCompGroupId === groupId,
        )
        .map(item => item.id),
    );
    if (groupIds.size === 0) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      let inserted = false;
      return {
        blocks: state.blocks.flatMap(item => {
          if (!groupIds.has(item.id)) {
            return [item];
          }
          if (inserted) {
            return [];
          }
          inserted = true;
          return [block];
        }),
        selectedBlockId: block.id,
        selectedBlockIds: [block.id],
        selectedTrackId: block.trackId,
        syncSource: 'ui',
      };
    });
  },
  replaceAudioBlockMedia: (blockId, media) => {
    const block = get().blocks.find(item => item.id === blockId);
    if (
      !block ||
      block.type !== 'audio' ||
      isDrumPatternBlock(block) ||
      !media.audioFilePath ||
      !media.absoluteAudioFilePath
    ) {
      return;
    }

    const nextBlock = audioBlockWithReplacementMedia(block, media);
    if (jsonEqual(block, nextBlock)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(item => (item.id === blockId ? nextBlock : item)),
      syncSource: 'ui',
    }));
    upsertBlockForEngine(nextBlock);
  },
  replaceAudioBlocksMedia: replacements => {
    const replacementByBlockId = new Map(
      replacements
        .filter(item => item.media.audioFilePath && item.media.absoluteAudioFilePath)
        .map(item => [item.blockId, item.media]),
    );
    if (replacementByBlockId.size === 0) {
      return;
    }

    const nextBlocks: DAWBlock[] = [];
    const changedBlocks: DAWBlock[] = [];
    for (const block of get().blocks) {
      const media = replacementByBlockId.get(block.id);
      if (!media || block.type !== 'audio' || isDrumPatternBlock(block)) {
        nextBlocks.push(block);
        continue;
      }

      const nextBlock = audioBlockWithReplacementMedia(block, media);
      nextBlocks.push(nextBlock);
      if (!jsonEqual(block, nextBlock)) {
        changedBlocks.push(nextBlock);
      }
    }

    if (changedBlocks.length === 0) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set({blocks: nextBlocks, syncSource: 'ui'});
    changedBlocks.forEach(upsertBlockForEngine);
  },
  removeBlock: blockId => {
    const blockToRemove = get().blocks.find(block => block.id === blockId);
    if (!blockToRemove) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      if (!state.blocks.some(block => block.id === blockId)) {
        return state;
      }

      const nextBlocks = state.blocks.filter(block => block.id !== blockId);
      const selectedBlockIds = state.selectedBlockIds.filter(id => id !== blockId);
      const selectedBlockId = state.selectedBlockId === blockId
        ? selectedBlockIds[selectedBlockIds.length - 1] ?? null
        : state.selectedBlockId;
      return {
        ...state,
        blocks: nextBlocks,
        selectedBlockId,
        selectedBlockIds,
        recordingBlockId: state.recordingBlockId === blockId ? null : state.recordingBlockId,
        isRecording: state.recordingBlockId === blockId ? false : state.isRecording,
        recordingStartSeconds: state.recordingBlockId === blockId ? null : state.recordingStartSeconds,
        syncSource: 'ui',
      };
    });
  },
  removeBlocks: blockIds => {
    const idsToRemove = new Set(blockIds);
    if (idsToRemove.size === 0 || !get().blocks.some(block => idsToRemove.has(block.id))) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => {
      const nextBlocks = state.blocks.filter(block => !idsToRemove.has(block.id));
      const selectedBlockIds = state.selectedBlockIds.filter(id => !idsToRemove.has(id));
      const selectedBlockId = state.selectedBlockId && idsToRemove.has(state.selectedBlockId)
        ? selectedBlockIds[selectedBlockIds.length - 1] ?? null
        : state.selectedBlockId;
      return {
        blocks: nextBlocks,
        selectedBlockId,
        selectedBlockIds,
        recordingBlockId: state.recordingBlockId && idsToRemove.has(state.recordingBlockId)
          ? null
          : state.recordingBlockId,
        isRecording: state.recordingBlockId && idsToRemove.has(state.recordingBlockId)
          ? false
          : state.isRecording,
        recordingStartSeconds: state.recordingBlockId && idsToRemove.has(state.recordingBlockId)
          ? null
          : state.recordingStartSeconds,
        syncSource: 'ui',
      };
    });
  },
  selectBlock: (blockId, options) =>
    set(state => {
      const selectedBlock = blockId ? state.blocks.find(block => block.id === blockId) : null;
      if (!selectedBlock) {
        return {
          selectedBlockId: null,
          selectedBlockIds: [],
          syncSource: 'ui',
        };
      }

      if (options?.additive) {
        const requestedBlockId = blockId;
        const existingIds = state.selectedBlockIds.filter(id =>
          state.blocks.some(block => block.id === id),
        );
        const alreadySelected = existingIds.includes(requestedBlockId);
        const selectedBlockIds = alreadySelected
          ? existingIds.filter(id => id !== requestedBlockId)
          : [...existingIds, requestedBlockId];
        const activeBlockId = selectedBlockIds[selectedBlockIds.length - 1] ?? null;
        const activeBlock = activeBlockId
          ? state.blocks.find(block => block.id === activeBlockId)
          : null;
        return {
          selectedBlockId: activeBlockId,
          selectedBlockIds,
          selectedTrackId: activeBlock?.trackId ?? selectedBlock.trackId,
          syncSource: 'ui',
        };
      }

      return {
        selectedBlockId: blockId,
        selectedBlockIds: [blockId],
        selectedTrackId: selectedBlock.trackId,
        syncSource: 'ui',
      };
    }),
  addNoteToBlock: (blockId, note) => {
    if (!get().blocks.some(block => block.id === blockId)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block =>
        block.id === blockId ? {...block, notes: [...(block.notes ?? []), note]} : block,
      ),
      syncSource: 'ui',
    }));
  },
  removeNoteFromBlock: (blockId, noteIndex) => {
    const block = get().blocks.find(item => item.id === blockId);
    if (!block?.notes?.[noteIndex]) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block =>
        block.id === blockId
          ? {...block, notes: (block.notes ?? []).filter((_, index) => index !== noteIndex)}
          : block,
      ),
      syncSource: 'ui',
    }));
  },
  updateNoteInBlock: (blockId, noteIndex, updates) => {
    const note = get().blocks.find(block => block.id === blockId)?.notes?.[noteIndex];
    if (!note || jsonEqual(
      updates,
      Object.fromEntries(Object.keys(updates).map(key => [key, note[key as keyof DAWNote]])),
    )) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block =>
        block.id === blockId
          ? {
              ...block,
              notes: (block.notes ?? []).map((note, index) =>
                index === noteIndex ? {...note, ...updates} : note,
              ),
            }
          : block,
      ),
      syncSource: 'ui',
    }));
  },
  replaceBlockNotes: (blockId, notes) => {
    const block = get().blocks.find(item => item.id === blockId);
    if (!block || jsonEqual(block.notes ?? [], notes)) {
      return;
    }

    recordHistoryBeforeMutation(get);
    set(state => ({
      blocks: state.blocks.map(block => (block.id === blockId ? {...block, notes} : block)),
      syncSource: 'ui',
    }));
  },
  toggleDrumStep: (patternId, sampleKey, step, options) => {
    const state = get();
    const raw = state.patterns[patternId];
    if (!raw) {
      return;
    }

    recordHistoryBeforeMutation(get);
    const key = sampleKey as DrumSampleKey;
    const updated = toggleStep(raw, key, step);
    set({
      patterns: {...state.patterns, [patternId]: updated},
      syncSource: 'ui',
    });

    const linkedBlocks = state.blocks.filter(block => block.patternId === patternId);
    if (options?.syncEngine !== false) {
      linkedBlocks.forEach(block => {
        upsertBlockForEngine(block);
      });
    }
  },
  createDrumPattern: name => {
    recordHistoryBeforeMutation(get);
    const pattern = createEmptyPattern(name);
    set(state => ({
      patterns: {...state.patterns, [pattern.id]: pattern},
      syncSource: 'ui',
    }));
    return pattern.id;
  },
  applyEngineTransportState: payload =>
    set(state => {
      const nextBpm = payload.bpm ?? state.bpm;
      if (state.nativeCountInActive) {
        return {
          bpm: nextBpm,
          isMetronomeEnabled: payload.clickTrackEnabled ?? state.isMetronomeEnabled,
          syncSource: 'engine',
        };
      }
      // Start from UI playhead; never use `??` with engine 0 (0 is valid and was wiping the store).
      let nextSeconds = state.playheadSeconds;

      let nextIsPlaying = state.isPlaying;
      if (payload.isPlaying !== undefined && !state.isRecording) {
        if (state.playAwaitingEngine) {
          // Only native isPlaying:true hands off; ignore false while UI Play is active.
          if (payload.isPlaying === true) {
            nextIsPlaying = true;
          }
        } else if (state.playheadOwnedByUser) {
          nextIsPlaying = state.isPlaying;
        } else {
          nextIsPlaying = payload.isPlaying;
        }
      } else if (payload.isPlaying === true && state.isRecording) {
        nextIsPlaying = true;
      }

      if (payload.positionBeat !== undefined && !state.playheadOwnedByUser) {
        const engineBeat = payload.positionBeat;
        nextSeconds =
          payload.positionSeconds ??
          tempoMapSecondsAtBeat(engineBeat, nextBpm, state.tempoMap);
      } else if (payload.positionSeconds !== undefined) {
        const enginePos = payload.positionSeconds;
        const staleZero =
          enginePos < 0.05 && state.playheadSeconds > 0.05 && !state.isPlaying;

        if (state.playheadOwnedByUser && !state.isRecording) {
          nextSeconds = state.playheadSeconds;
        } else if (nextIsPlaying) {
          if (state.isRecording && state.recordingWallClockStart !== null) {
            const wallElapsed = Math.max(0, Date.now() / 1000 - state.recordingWallClockStart);
            nextSeconds = Math.max(enginePos, wallElapsed);
          } else {
            nextSeconds = enginePos;
          }
        } else if (!state.isRecording) {
          nextSeconds = staleZero ? state.playheadSeconds : enginePos;
        } else {
          nextSeconds = enginePos;
        }
      }

      const resolvedBeat =
        payload.positionBeat !== undefined && !state.playheadOwnedByUser
          ? payload.positionBeat
          : tempoMapBeatAtSeconds(nextSeconds, nextBpm, state.tempoMap);

      const updates: Partial<DAWState> = {
        bpm: nextBpm,
        isMetronomeEnabled: payload.clickTrackEnabled ?? state.isMetronomeEnabled,
        playheadSeconds: nextSeconds,
        playheadBeat: resolvedBeat,
        syncSource: 'engine',
      };

      if (payload.isPlaying !== undefined && !state.playAwaitingEngine) {
        updates.isPlaying = nextIsPlaying;
      } else if (payload.isPlaying === true && state.playAwaitingEngine) {
        updates.isPlaying = true;
      }

      if (payload.isPlaying === true && state.playAwaitingEngine) {
        updates.playAwaitingEngine = false;
        updates.playWallClockAnchor = null;
      }

      if (state.isRecording && state.recordingBlockId) {
        const recordingBlock = state.blocks.find(block => block.id === state.recordingBlockId);
        if (recordingBlock) {
          const grown = growRecordingBlockFromElapsed(
            recordingBlock,
            resolvedBeat,
            state.recordingStartSeconds,
            nextSeconds,
            nextBpm,
            state.tempoMap,
          );
          if (grown.lengthBeats !== recordingBlock.lengthBeats) {
            updates.blocks = state.blocks.map(block =>
              block.id === state.recordingBlockId ? grown : block,
            );
            updates.syncSource = 'ui';
          }
        }
      }

      return {...state, ...updates};
    }),
}));

export function defaultTrackColor(index: number): string {
  return BLOCK_COLORS[index % BLOCK_COLORS.length];
}

export function getTrackInstrumentLabel(track: DAWTrack): string {
  const instrument = instrumentForTrack(track.type, track.instrumentId);
  const preset = instrument.presets.find(item => item.id === track.presetId);
  return preset?.label ?? track.presetId;
}

export function isSoftwareInstrumentTrack(track: DAWTrack): boolean {
  return track.type === 'software_instrument';
}

export function isBottomPanelTrack(track: DAWTrack): boolean {
  return isBottomPanelTrackType(track.type);
}

/** @deprecated Use isBottomPanelTrack; kept for tests referencing keyboard lanes. */
export function isKeyboardCapableTrack(track: DAWTrack): boolean {
  return isBottomPanelTrack(track);
}
