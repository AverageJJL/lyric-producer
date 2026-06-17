import type {DrumPattern} from '../music/drumPatterns';
import {refreshPlaybackAndInstruments} from '../native/refreshPlayback';
import type {DAWBlock, DAWTrack} from './useDAWStore';
import type {ChordMetadata, ScaleMetadata, SectionMarker, TimeSignature} from './projectMetadata';
import type {LooperLengthBars, ProjectPerformanceMode} from '../transport/performanceMode';
import type {MeterMapEvent, TempoMapEvent} from '../transport/tempoMap';

/** Arrangement slice included in undo/redo — selection and recording stay out of history. */
export type ArrangementHistorySnapshot = {
  tracks: DAWTrack[];
  patterns: Record<string, DrumPattern>;
  blocks: DAWBlock[];
  bpm: number;
  tempoMap: TempoMapEvent[];
  meterMap: MeterMapEvent[];
  masterVolumeDb: number;
  masterPan: number;
  performanceMode: ProjectPerformanceMode;
  looperLengthBars: LooperLengthBars;
  isCycleEnabled: boolean;
  cycleStartBeat: number;
  cycleEndBeat: number;
  timeSignature: TimeSignature;
  scale: ScaleMetadata | null;
  chord: ChordMetadata | null;
  sections: SectionMarker[];
};

const MAX_HISTORY = 50;

let past: ArrangementHistorySnapshot[] = [];
let future: ArrangementHistorySnapshot[] = [];
let suppressRecording = false;

function cloneTrack(track: DAWTrack): DAWTrack {
  return {
    ...track,
    samplerRegions: track.samplerRegions?.map(region => ({...region})),
  };
}

function cloneBlock(block: DAWBlock): DAWBlock {
  return {
    ...block,
    notes: block.notes ? block.notes.map(note => ({...note})) : undefined,
    waveformPeaks: block.waveformPeaks ? [...block.waveformPeaks] : undefined,
  };
}

function clonePattern(pattern: DrumPattern): DrumPattern {
  return {
    ...pattern,
    steps: Object.fromEntries(
      Object.entries(pattern.steps).map(([key, row]) => [key, [...row]]),
    ) as DrumPattern['steps'],
  };
}

export function captureArrangementHistorySnapshot(
  state: ArrangementHistorySnapshot & {
    tracks: DAWTrack[];
    patterns: Record<string, DrumPattern>;
    blocks: DAWBlock[];
  },
): ArrangementHistorySnapshot {
  return {
    tracks: state.tracks.map(cloneTrack),
    patterns: Object.fromEntries(
      Object.entries(state.patterns).map(([id, pattern]) => [id, clonePattern(pattern)]),
    ),
    blocks: state.blocks.map(cloneBlock),
    bpm: state.bpm,
    tempoMap: state.tempoMap.map(event => ({...event})),
    meterMap: state.meterMap.map(event => ({
      ...event,
      timeSignature: {...event.timeSignature},
    })),
    masterVolumeDb: state.masterVolumeDb,
    masterPan: state.masterPan,
    performanceMode: state.performanceMode,
    looperLengthBars: state.looperLengthBars,
    isCycleEnabled: state.isCycleEnabled,
    cycleStartBeat: state.cycleStartBeat,
    cycleEndBeat: state.cycleEndBeat,
    timeSignature: {...state.timeSignature},
    scale: state.scale ? {...state.scale} : null,
    chord: state.chord ? {...state.chord} : null,
    sections: state.sections.map(section => ({...section})),
  };
}

export function recordArrangementHistory(
  snapshot: ArrangementHistorySnapshot,
): void {
  if (suppressRecording) {
    return;
  }

  past.push(snapshot);
  if (past.length > MAX_HISTORY) {
    past.shift();
  }
  future = [];
}

export function canUndoArrangement(): boolean {
  return past.length > 0;
}

export function canRedoArrangement(): boolean {
  return future.length > 0;
}

export function clearArrangementHistory(): void {
  past = [];
  future = [];
}

type HistoryApplyContext = {
  getSnapshot: () => ArrangementHistorySnapshot;
  applySnapshot: (snapshot: ArrangementHistorySnapshot) => void;
};

export function undoArrangement(context: HistoryApplyContext): boolean {
  if (past.length === 0) {
    return false;
  }

  const current = captureArrangementHistorySnapshot(context.getSnapshot());
  const previous = past.pop()!;
  future.push(current);

  suppressRecording = true;
  context.applySnapshot(previous);
  refreshPlaybackAndInstruments();
  suppressRecording = false;
  return true;
}

export function redoArrangement(context: HistoryApplyContext): boolean {
  if (future.length === 0) {
    return false;
  }

  const current = captureArrangementHistorySnapshot(context.getSnapshot());
  const next = future.pop()!;
  past.push(current);

  suppressRecording = true;
  context.applySnapshot(next);
  refreshPlaybackAndInstruments();
  suppressRecording = false;
  return true;
}

/** Test helper — reset stacks between Jest cases. */
export function resetArrangementHistoryForTests(): void {
  past = [];
  future = [];
  suppressRecording = false;
}
