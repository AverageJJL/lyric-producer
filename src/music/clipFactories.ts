import type {DAWBlock} from '../store/useDAWStore';
import {BEATS_PER_BAR} from './drumPatterns';
import {BLOCK_COLORS} from '../ui/timelineLayout';

/** Placeholder length while recording — grows with transport; not a fixed bar count. */
export const RECORDING_INITIAL_LENGTH_BEATS = 0;

let blockIdCounter = 0;

function nextBlockId(prefix: string, trackId: string): string {
  blockIdCounter += 1;
  return `${prefix}-${trackId}-${Date.now()}-${blockIdCounter}`;
}

/** Empty MIDI clip at playhead for software-instrument recording. */
export function createRecordingMidiBlock(
  trackId: string,
  colorIndex: number,
  startBeat: number,
  lengthBeats = RECORDING_INITIAL_LENGTH_BEATS,
): DAWBlock {
  return {
    id: nextBlockId('block-midi', trackId),
    trackId,
    name: 'Recording',
    startBeat,
    lengthBeats,
    type: 'midi',
    color: BLOCK_COLORS[colorIndex % BLOCK_COLORS.length],
    notes: [],
  };
}

/** Empty MIDI region for deliberate piano-roll editing outside the recording path. */
export function createMidiClipBlock(
  trackId: string,
  colorIndex: number,
  startBeat: number,
  lengthBeats: number,
): DAWBlock {
  return {
    id: nextBlockId('block-midi', trackId),
    trackId,
    name: 'MIDI',
    startBeat,
    lengthBeats,
    type: 'midi',
    color: BLOCK_COLORS[colorIndex % BLOCK_COLORS.length],
    notes: [],
  };
}

/** One-bar drum pattern clip referencing a pattern in the patterns store. */
export function createDefaultDrumPatternBlock(
  trackId: string,
  colorIndex: number,
  startBeat: number,
  patternId: string,
  patternName = 'Pattern A',
): DAWBlock {
  return {
    id: nextBlockId('block-pattern', trackId),
    trackId,
    name: patternName,
    startBeat,
    lengthBeats: BEATS_PER_BAR,
    type: 'audio',
    color: BLOCK_COLORS[colorIndex % BLOCK_COLORS.length],
    patternId,
    sourceLengthBeats: BEATS_PER_BAR,
    sourceOffsetBeats: 0,
  };
}

/** Empty audio clip placeholder for voice recording. */
export function createRecordingAudioBlock(
  trackId: string,
  colorIndex: number,
  startBeat: number,
  lengthBeats = RECORDING_INITIAL_LENGTH_BEATS,
): DAWBlock {
  return {
    id: nextBlockId('block-audio', trackId),
    trackId,
    name: 'Recording',
    startBeat,
    lengthBeats,
    type: 'audio',
    color: BLOCK_COLORS[colorIndex % BLOCK_COLORS.length],
    sourceLengthBeats: lengthBeats,
    sourceOffsetBeats: 0,
  };
}

export function isDrumPatternBlock(block: DAWBlock): boolean {
  return block.type === 'audio' && Boolean(block.patternId);
}
