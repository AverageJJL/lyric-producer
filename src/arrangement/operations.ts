import type {DrumPattern} from '../music/drumPatterns';
import type {TrackTemplateId} from '../music/trackTemplates';
import type {DAWBlock, DAWNote, DAWTrack} from '../store/useDAWStore';
import {useDAWStore} from '../store/useDAWStore';
import type {
  ChordMetadata,
  ScaleMetadata,
  SectionMarker,
  TimeSignature,
} from '../store/projectMetadata';
import {normalizeMidiClip, type RawMidiNoteInput} from '../music/midiClipNormalization';
import {refreshPlaybackAndInstruments, upsertBlockForEngine} from '../native/refreshPlayback';
import {captureProjectSnapshot, type ProjectSnapshot} from './projectSnapshot';
import type {SnapGrid} from '../ui/snapGrid';
import {shouldSkipLockedArrangementOperation} from './operationLocks';
import type {LooperLengthBars, ProjectPerformanceMode} from '../transport/performanceMode';
import {
  applySamplerSliceOperation,
  type CreateSamplerFromSlicesOperation,
} from './samplerSliceOperation';
import {
  blockFromSnapshot,
  restoreTrackWithHistory,
  trackFromSnapshot,
  upsertBlockWithHistory,
  upsertDrumPatternWithHistory,
} from './arrangementOperationMutations';

export type ArrangementOperation =
  | {op: 'createTrack'; templateId: TrackTemplateId; trackId?: string; instrumentId?: string; presetId?: string; name?: string}
  | {op: 'restoreTrack'; track: DAWTrack}
  | {op: 'deleteTrack'; trackId: string}
  | {op: 'deleteClip'; clipId: string}
  | {op: 'setTrackInstrument'; trackId: string; instrumentId: string; presetId?: string}
  | {op: 'setTrackPreset'; trackId: string; presetId: string}
  | {op: 'setTrackLocked'; trackId: string; isLocked: boolean}
  | {op: 'setClipLocked'; clipId: string; isLocked: boolean}
  | {op: 'setBpm'; bpm: number}
  | {op: 'setMasterMix'; volumeDb: number; pan: number}
  | {op: 'setSnapGrid'; snapGrid: SnapGrid}
  | {op: 'setRelativeSnap'; enabled: boolean}
  | {op: 'setPerformanceMode'; mode: ProjectPerformanceMode; looperLengthBars?: LooperLengthBars}
  | {op: 'setCycle'; enabled: boolean; startBeat: number; endBeat: number}
  | {op: 'setTransport'; isPlaying: boolean}
  | {op: 'setPlayheadBeat'; beat: number}
  | {op: 'setTimeSignature'; timeSignature: TimeSignature}
  | {op: 'setScale'; scale: ScaleMetadata | null}
  | {op: 'setChord'; chord: ChordMetadata | null}
  | {op: 'setSections'; sections: SectionMarker[]}
  | {op: 'upsertMidiClip'; clip: MidiClipIntent}
  | CreateSamplerFromSlicesOperation
  | {op: 'upsertDrumPattern'; pattern: DrumPattern}
  | {op: 'upsertDrumClip'; clip: DrumClipIntent}
  | {op: 'restoreBlock'; block: DAWBlock}
  | {op: 'moveClip'; clipId: string; startBeat: number; trackId?: string}
  | {op: 'resizeClip'; clipId: string; startBeat: number; lengthBeats: number};

export type MidiClipIntent = {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  notes: DAWNote[];
};

export type DrumClipIntent = {
  id: string;
  trackId: string;
  name: string;
  startBeat: number;
  lengthBeats: number;
  patternId: string;
};

export type ApplyArrangementOptions = {
  /** When true, skips native refresh at end (caller will sync). */
  skipNativeRefresh?: boolean;
};

/**
 * Deterministic, ordered arrangement mutations for scripted flows and future LLM action batches.
 * Does not parse JSON — callers map external payloads into ArrangementOperation[].
 */
export function applyArrangementOperations(
  operations: ArrangementOperation[],
  options?: ApplyArrangementOptions,
): ProjectSnapshot {
  const store = useDAWStore.getState();

  operations.forEach(operation => {
    if (shouldSkipLockedArrangementOperation(operation, useDAWStore.getState())) {
      return;
    }

    switch (operation.op) {
      case 'createTrack': {
        store.addTrackFromTemplate(operation.templateId, {
          id: operation.trackId,
          instrumentId: operation.instrumentId,
          presetId: operation.presetId,
          name: operation.name,
        });
        break;
      }
      case 'restoreTrack':
        restoreTrackWithHistory(operation.track);
        break;
      case 'deleteTrack':
        store.removeTrack(operation.trackId);
        break;
      case 'deleteClip':
        store.removeBlock(operation.clipId);
        break;
      case 'setTrackInstrument':
        store.setTrackInstrument(operation.trackId, operation.instrumentId, operation.presetId);
        break;
      case 'setTrackPreset':
        store.setTrackPreset(operation.trackId, operation.presetId);
        break;
      case 'setTrackLocked':
        store.setTrackLocked(operation.trackId, operation.isLocked);
        break;
      case 'setClipLocked':
        store.setBlockLocked(operation.clipId, operation.isLocked);
        break;
      case 'setBpm':
        store.setBpm(operation.bpm);
        break;
      case 'setMasterMix':
        store.setMasterVolumeDb(operation.volumeDb);
        store.setMasterPan(operation.pan);
        break;
      case 'setSnapGrid':
        store.setSnapGrid(operation.snapGrid);
        break;
      case 'setRelativeSnap':
        store.setRelativeSnapEnabled(operation.enabled);
        break;
      case 'setPerformanceMode':
        if (operation.looperLengthBars) {
          store.setLooperLengthBars(operation.looperLengthBars);
        }
        store.setPerformanceMode(operation.mode);
        break;
      case 'setCycle':
        store.setCycleRange(operation.startBeat, operation.endBeat, {enable: operation.enabled});
        break;
      case 'setTransport':
        store.setIsPlaying(operation.isPlaying);
        break;
      case 'setPlayheadBeat':
        store.setPlayheadBeat(operation.beat, {syncTransport: false});
        break;
      case 'setTimeSignature':
        store.setTimeSignature(operation.timeSignature);
        break;
      case 'setScale':
        store.setScale(operation.scale);
        break;
      case 'setChord':
        store.setChord(operation.chord);
        break;
      case 'setSections':
        store.setSections(operation.sections);
        break;
      case 'upsertMidiClip': {
        const project = useDAWStore.getState();
        const normalized = normalizeMidiClip(operation.clip.notes as RawMidiNoteInput[], {
          bpm: project.bpm,
          timeSignature: project.timeSignature,
          requestedLengthBeats: operation.clip.lengthBeats,
        });
        const block: DAWBlock = {
          id: operation.clip.id,
          trackId: operation.clip.trackId,
          name: operation.clip.name,
          startBeat: operation.clip.startBeat,
          lengthBeats: normalized.lengthBeats,
          type: 'midi',
          color: '#4a7fd4',
          notes: normalized.notes,
        };
        upsertBlockWithHistory(block);
        if (!options?.skipNativeRefresh) {
          upsertBlockForEngine(block);
        }
        break;
      }
      case 'createSamplerFromSlices':
        applySamplerSliceOperation(operation);
        break;
      case 'upsertDrumPattern':
        upsertDrumPatternWithHistory(operation.pattern);
        break;
      case 'upsertDrumClip': {
        const block: DAWBlock = {
          id: operation.clip.id,
          trackId: operation.clip.trackId,
          name: operation.clip.name,
          startBeat: operation.clip.startBeat,
          lengthBeats: operation.clip.lengthBeats,
          type: 'audio',
          color: '#c45c26',
          patternId: operation.clip.patternId,
          sourceLengthBeats: operation.clip.lengthBeats,
          sourceOffsetBeats: 0,
        };
        upsertBlockWithHistory(block);
        break;
      }
      case 'restoreBlock':
        upsertBlockWithHistory(blockFromSnapshot(operation.block));
        break;
      case 'moveClip':
        store.moveBlock(operation.clipId, operation.startBeat, operation.trackId);
        break;
      case 'resizeClip':
        store.resizeBlock(operation.clipId, operation.startBeat, operation.lengthBeats);
        break;
      default:
        break;
    }
  });

  if (!options?.skipNativeRefresh) {
    refreshPlaybackAndInstruments();
  }

  return captureProjectSnapshot();
}

/** Map a captured snapshot into ordered ops for round-trip replay tests. */
export function operationsFromSnapshot(snapshot: ProjectSnapshot): ArrangementOperation[] {
  const ops: ArrangementOperation[] = [
    {op: 'setBpm', bpm: snapshot.bpm},
    {op: 'setMasterMix', volumeDb: snapshot.masterVolumeDb, pan: snapshot.masterPan},
    {op: 'setSnapGrid', snapGrid: snapshot.snapGrid},
    {op: 'setRelativeSnap', enabled: snapshot.isRelativeSnapEnabled},
    {
      op: 'setPerformanceMode',
      mode: snapshot.performanceMode,
      looperLengthBars: snapshot.looperLengthBars,
    },
    {op: 'setCycle', enabled: snapshot.isCycleEnabled, startBeat: snapshot.cycleStartBeat, endBeat: snapshot.cycleEndBeat},
    {op: 'setTimeSignature', timeSignature: snapshot.timeSignature},
    {op: 'setScale', scale: snapshot.scale},
    {op: 'setChord', chord: snapshot.chord},
    {op: 'setSections', sections: snapshot.sections.map(section => ({...section}))},
    {op: 'setPlayheadBeat', beat: snapshot.playheadBeat},
    {op: 'setTransport', isPlaying: snapshot.isPlaying},
  ];

  snapshot.tracks.forEach(track => {
    ops.push({
      op: 'restoreTrack',
      track: {
        ...trackFromSnapshot(track),
      },
    });
  });

  Object.values(snapshot.patterns).forEach(pattern => {
    ops.push({op: 'upsertDrumPattern', pattern: {...pattern}});
  });

  snapshot.blocks.forEach(block => {
    ops.push({op: 'restoreBlock', block: blockFromSnapshot(block)});
  });

  return ops;
}
