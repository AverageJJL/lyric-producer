import {
  buildGhostMidiBlock,
  shouldShowGhostMidiPreview,
} from '../../store/livePreview';
import {defaultTrackColor} from '../../store/useDAWStore';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import type {LiveMidiPreview} from '../../store/livePreview';
import {
  compSourceTakeBlocks,
  compVersionState,
  recordingCompFolderRange,
} from '../../transport/recordingComp';

type DisplayTimelineBlocksInput = {
  blocks: DAWBlock[];
  tracks: DAWTrack[];
  liveMidiPreviewByTrack: Record<string, LiveMidiPreview>;
  isRecording: boolean;
  playheadBeat: number;
};

export function displayTimelineBlocks({
  blocks,
  tracks,
  liveMidiPreviewByTrack,
  isRecording,
  playheadBeat,
}: DisplayTimelineBlocksInput): DAWBlock[] {
  const ghostBlocks: DAWBlock[] = [];
  tracks.forEach((track, index) => {
    const preview = liveMidiPreviewByTrack[track.id];
    if (shouldShowGhostMidiPreview(preview, track.id, isRecording)) {
      ghostBlocks.push(buildGhostMidiBlock(preview!, track.id, defaultTrackColor(index), playheadBeat));
    }
  });
  return [...recordingCompDisplayBlocks(blocks), ...ghostBlocks];
}

function recordingCompDisplayBlocks(blocks: DAWBlock[]): DAWBlock[] {
  const compGroupIds = Array.from(new Set(
    blocks
      .map(block => block.recordingCompGroupId)
      .filter((groupId): groupId is string => Boolean(groupId)),
  ));
  const displayCompBlocks = compGroupIds.flatMap(groupId => {
    const outputs = blocks.filter(block => block.recordingCompGroupId === groupId);
    const carrier = outputs[0] ?? compSourceTakeBlocks(blocks, groupId)[0];
    const range = recordingCompFolderRange(blocks, groupId);
    if (!carrier || !range || range.endBeat <= range.startBeat) {
      return [];
    }
    const versionState = compVersionState(blocks, groupId);
    const activeSegments = versionState.versions.find(
      version => version.id === versionState.activeVersionId,
    )?.segments ?? [];
    const compositePeaks = compositeCompPeaks(blocks, groupId, activeSegments);
    return [{
      ...carrier,
      id: `${groupId}:display`,
      name: 'Comp',
      startBeat: range.startBeat,
      lengthBeats: range.endBeat - range.startBeat,
      recordingCompGroupId: groupId,
      recordingCompSourceTakeId: undefined,
      recordingCompSegmentId: undefined,
      recordingCompSegments: activeSegments,
      recordingCompVersions: versionState.versions,
      activeRecordingCompVersionId: versionState.activeVersionId,
      waveformPeaks: compositePeaks.length > 0 ? compositePeaks : carrier.waveformPeaks,
      sourceLengthBeats: range.endBeat - range.startBeat,
      sourceOffsetBeats: 0,
      isRecordingCompDisplayBlock: true,
    }];
  });
  const compGroupIdSet = new Set(compGroupIds);
  const sourceAndNormalBlocks = blocks
    .filter(block => !block.recordingCompGroupId)
    .map(block => {
      if (!block.recordingTakeGroupId || !compGroupIdSet.has(block.recordingTakeGroupId)) {
        return block;
      }
      const range = recordingCompFolderRange(blocks, block.recordingTakeGroupId);
      return range
        ? {
            ...block,
            startBeat: range.startBeat,
            lengthBeats: range.endBeat - range.startBeat,
          }
        : block;
    });
  return [
    ...sourceAndNormalBlocks,
    ...displayCompBlocks,
  ];
}

function compositeCompPeaks(
  blocks: DAWBlock[],
  groupId: string,
  segments: Array<{takeId: string; startBeat: number; endBeat: number}>,
): number[] {
  const takes = new Map(
    compSourceTakeBlocks(blocks, groupId).map(take => [take.recordingTakeId ?? take.id, take]),
  );
  return segments.flatMap(segment => {
    const take = takes.get(segment.takeId);
    const peaks = take?.waveformPeaks ?? [];
    const sourceLength = take?.sourceLengthBeats ?? take?.lengthBeats ?? 0;
    if (!take || peaks.length === 0 || sourceLength <= 0) {
      return [];
    }
    const peaksPerBeat = peaks.length / sourceLength;
    const sourceStartBeat = (take.sourceOffsetBeats ?? 0) + Math.max(0, segment.startBeat - take.startBeat);
    const sourceEndBeat = sourceStartBeat + Math.max(0, segment.endBeat - segment.startBeat);
    const startIndex = Math.max(0, Math.floor(sourceStartBeat * peaksPerBeat));
    const endIndex = Math.min(peaks.length, Math.max(startIndex + 1, Math.ceil(sourceEndBeat * peaksPerBeat)));
    return peaks.slice(startIndex, endIndex);
  });
}
