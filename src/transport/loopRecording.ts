import type {DAWBlock, DAWNote} from '../store/useDAWStore';

const MIN_LOOP_TAKE_BEATS = 0.0625;

type LoopRecordingRange = {
  cycleStartBeat: number;
  cycleEndBeat: number;
};

function noteEnd(note: DAWNote): number {
  return note.startBeat + note.lengthBeats;
}

function passNotes(notes: DAWNote[] | undefined, passStart: number, passEnd: number): DAWNote[] {
  return (notes ?? []).flatMap(note => {
    const start = Math.max(note.startBeat, passStart);
    const end = Math.min(noteEnd(note), passEnd);
    if (end - start < MIN_LOOP_TAKE_BEATS) {
      return [];
    }
    return [{
      ...note,
      startBeat: Number((start - passStart).toFixed(6)),
      lengthBeats: Number((end - start).toFixed(6)),
    }];
  });
}

function loopTakeBlock(
  block: DAWBlock,
  notes: DAWNote[],
  range: LoopRecordingRange,
  passIndex: number,
  passCount: number,
  lengthBeats = range.cycleEndBeat - range.cycleStartBeat,
): DAWBlock {
  const takeId = passIndex === 0 ? block.id : `${block.id}-loop-${passIndex + 1}`;
  return {
    ...block,
    id: takeId,
    name: 'Loop Take',
    startBeat: range.cycleStartBeat,
    lengthBeats,
    notes,
    recordingTakeGroupId: `loop:${block.trackId}:${block.id}`,
    recordingTakeId: takeId,
    recordingTakeIndex: passIndex,
    recordingTakeActive: passIndex === passCount - 1,
    isMuted: undefined,
  };
}

function audioLoopTakeBlock(
  block: DAWBlock,
  range: LoopRecordingRange,
  passIndex: number,
  passCount: number,
  totalLength: number,
  loopLength: number,
): DAWBlock {
  const passStart = passIndex * loopLength;
  const passLength = Number(Math.min(loopLength, totalLength - passStart).toFixed(6));
  const takeId = passIndex === 0 ? block.id : `${block.id}-loop-${passIndex + 1}`;
  const sourceOffsetBeats = Number(((block.sourceOffsetBeats ?? 0) + passStart).toFixed(6));
  return {
    ...block,
    id: takeId,
    name: 'Loop Take',
    startBeat: range.cycleStartBeat,
    lengthBeats: passLength,
    sourceLengthBeats: totalLength,
    sourceOffsetBeats,
    recordingTakeGroupId: `loop:${block.trackId}:${block.id}`,
    recordingTakeId: takeId,
    recordingTakeIndex: passIndex,
    recordingTakeActive: passIndex === passCount - 1,
    isMuted: undefined,
  };
}

export function finalizedMidiLoopRecordingTakes(
  block: DAWBlock,
  range: LoopRecordingRange,
): DAWBlock[] {
  if (block.type !== 'midi' || range.cycleEndBeat <= range.cycleStartBeat) {
    return [block];
  }

  const loopLength = range.cycleEndBeat - range.cycleStartBeat;
  const maxNoteEnd = Math.max(0, ...(block.notes ?? []).map(noteEnd));
  const totalLength = Math.max(block.lengthBeats, maxNoteEnd, loopLength);
  const passCount = Math.max(1, Math.ceil(totalLength / loopLength));
  const takes = Array.from({length: passCount}, (_, passIndex) => {
    const passStart = passIndex * loopLength;
    const passEnd = passStart + loopLength;
    return {
      passIndex,
      notes: passNotes(block.notes, passStart, passEnd),
    };
  }).filter(pass => pass.notes.length > 0);

  if (takes.length === 0) {
    return [block];
  }

  return takes.map((pass, takeIndex) =>
    loopTakeBlock(block, pass.notes, range, takeIndex, takes.length),
  );
}

export function finalizedAudioLoopRecordingTakes(
  block: DAWBlock,
  range: LoopRecordingRange,
): DAWBlock[] {
  if (block.type !== 'audio' || range.cycleEndBeat <= range.cycleStartBeat) {
    return [block];
  }

  const loopLength = range.cycleEndBeat - range.cycleStartBeat;
  const totalLength = Number(Math.max(
    block.lengthBeats,
    block.sourceLengthBeats ?? block.lengthBeats,
  ).toFixed(6));
  const passCount = Math.max(1, Math.ceil(totalLength / loopLength));
  return Array.from({length: passCount}, (_, passIndex) =>
    audioLoopTakeBlock(block, range, passIndex, passCount, totalLength, loopLength),
  ).filter(take => take.lengthBeats >= MIN_LOOP_TAKE_BEATS);
}

export function finalizedLoopRecordingTakes(
  block: DAWBlock,
  range: LoopRecordingRange,
): DAWBlock[] {
  if (block.type === 'audio') {
    return finalizedAudioLoopRecordingTakes(block, range);
  }
  return finalizedMidiLoopRecordingTakes(block, range);
}
