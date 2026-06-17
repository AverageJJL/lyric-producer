import type {DAWBlock, RecordingCompSegment, RecordingCompVersion} from '../store/useDAWStore';

export const RECORDING_COMP_CROSSFADE_BEATS = 0.05;

function roundBeat(value: number): number {
  return Number(value.toFixed(6));
}

function segmentId(groupId: string, takeId: string, startBeat: number, endBeat: number): string {
  return `${groupId}:seg:${takeId}:${roundBeat(startBeat)}:${roundBeat(endBeat)}`;
}

function outputBlockId(groupId: string, takeId: string, startBeat: number, endBeat: number): string {
  return `${groupId}:comp:${takeId}:${roundBeat(startBeat)}:${roundBeat(endBeat)}`;
}

export function isRecordingCompOutputBlock(
  block: Pick<DAWBlock, 'recordingCompGroupId'>,
): boolean {
  return Boolean(block.recordingCompGroupId);
}

export function compSourceTakeBlocks(blocks: DAWBlock[], groupId: string): DAWBlock[] {
  return blocks
    .filter(block => block.recordingTakeGroupId === groupId && !isRecordingCompOutputBlock(block))
    .sort((left, right) => (left.recordingTakeIndex ?? 0) - (right.recordingTakeIndex ?? 0));
}

function groupStartBeat(takes: DAWBlock[]): number {
  return Math.min(...takes.map(take => take.startBeat));
}

function groupEndBeat(takes: DAWBlock[]): number {
  return Math.max(...takes.map(take => take.startBeat + take.lengthBeats));
}

export function recordingCompFolderRange(
  blocks: DAWBlock[],
  groupId: string,
): {startBeat: number; endBeat: number} | null {
  const takes = compSourceTakeBlocks(blocks, groupId);
  if (takes.length === 0) {
    return null;
  }
  return {
    startBeat: groupStartBeat(takes),
    endBeat: groupEndBeat(takes),
  };
}

function normalizedSegments(segments: RecordingCompSegment[]): RecordingCompSegment[] {
  return [...segments]
    .filter(segment => segment.endBeat - segment.startBeat > 0.0001)
    .sort((left, right) => left.startBeat - right.startBeat)
    .map(segment => ({
      ...segment,
      startBeat: roundBeat(segment.startBeat),
      endBeat: roundBeat(segment.endBeat),
    }));
}

function mergeAdjacentSegments(groupId: string, segments: RecordingCompSegment[]): RecordingCompSegment[] {
  return normalizedSegments(segments).reduce<RecordingCompSegment[]>((merged, segment) => {
    const previous = merged[merged.length - 1];
    if (previous && previous.takeId === segment.takeId && Math.abs(previous.endBeat - segment.startBeat) < 0.0001) {
      previous.endBeat = segment.endBeat;
      previous.id = segmentId(groupId, previous.takeId, previous.startBeat, previous.endBeat);
      return merged;
    }
    merged.push({...segment});
    return merged;
  }, []);
}

export function compSegmentsFromOutputs(blocks: DAWBlock[], groupId: string): RecordingCompSegment[] {
  return normalizedSegments(
    blocks
      .filter(block => block.recordingCompGroupId === groupId)
      .map(block => ({
        id: block.recordingCompSegmentId ?? block.id,
        takeId: block.recordingCompSourceTakeId ?? '',
        startBeat: block.startBeat,
        endBeat: block.startBeat + block.lengthBeats,
      }))
      .filter(segment => segment.takeId.length > 0),
  );
}

function defaultVersionId(groupId: string): string {
  return `${groupId}:version:a`;
}

function compVersionName(index: number): string {
  return `Comp ${String.fromCharCode(65 + index)}`;
}

function normalizedVersions(versions: RecordingCompVersion[]): RecordingCompVersion[] {
  return versions.map(version => ({
    ...version,
    segments: normalizedSegments(version.segments),
  }));
}

export function compVersionState(
  blocks: DAWBlock[],
  groupId: string,
  fallbackSegments = compSegmentsFromOutputs(blocks, groupId),
): {versions: RecordingCompVersion[]; activeVersionId: string} {
  const carrier = blocks.find(block => block.recordingCompGroupId === groupId);
  const versions = normalizedVersions(carrier?.recordingCompVersions ?? []);
  if (versions.length > 0) {
    return {
      versions,
      activeVersionId: carrier?.activeRecordingCompVersionId ?? versions[0]!.id,
    };
  }
  const segments = fallbackSegments.length > 0
    ? fallbackSegments
    : defaultCompSegmentsForGroup(blocks, groupId);
  return {
    versions: [{
      id: defaultVersionId(groupId),
      name: 'Comp A',
      segments,
    }],
    activeVersionId: defaultVersionId(groupId),
  };
}

export function defaultCompSegmentsForGroup(blocks: DAWBlock[], groupId: string): RecordingCompSegment[] {
  const takes = compSourceTakeBlocks(blocks, groupId);
  return compSegmentsCoveringRange(groupId, takes, [...takes].reverse());
}

export function fullTakeCompSegmentsForGroup(
  blocks: DAWBlock[],
  groupId: string,
  takeId: string,
): RecordingCompSegment[] {
  const takes = compSourceTakeBlocks(blocks, groupId);
  const preferred = takes.find(take => (take.recordingTakeId ?? take.id) === takeId);
  if (!preferred) {
    return defaultCompSegmentsForGroup(blocks, groupId);
  }
  return compSegmentsCoveringRange(groupId, takes, [
    preferred,
    ...[...takes].reverse().filter(take => take !== preferred),
  ]);
}

export function replaceCompRange(
  blocks: DAWBlock[],
  groupId: string,
  takeId: string,
  startBeat: number,
  endBeat: number,
): RecordingCompSegment[] {
  const takes = compSourceTakeBlocks(blocks, groupId);
  if (takes.length === 0 || endBeat <= startBeat) {
    return compSegmentsFromOutputs(blocks, groupId);
  }
  const range = recordingCompFolderRange(blocks, groupId);
  const rangeStart = range?.startBeat ?? groupStartBeat(takes);
  const rangeEnd = range?.endBeat ?? groupEndBeat(takes);
  const sourceTake = takes.find(take => (take.recordingTakeId ?? take.id) === takeId);
  const sourceStart = sourceTake?.startBeat ?? rangeStart;
  const sourceEnd = sourceTake ? sourceTake.startBeat + sourceTake.lengthBeats : rangeEnd;
  const nextStart = roundBeat(Math.max(rangeStart, sourceStart, Math.min(startBeat, rangeEnd)));
  const nextEnd = roundBeat(Math.max(nextStart, Math.min(endBeat, rangeEnd, sourceEnd)));
  const current = compSegmentsFromOutputs(blocks, groupId);
  const base = current.length > 0 ? current : defaultCompSegmentsForGroup(blocks, groupId);
  if (nextEnd <= nextStart) {
    return base;
  }
  const next = base.flatMap(segment => {
    if (segment.endBeat <= nextStart || segment.startBeat >= nextEnd) {
      return [segment];
    }
    return [
      ...(segment.startBeat < nextStart ? [{...segment, endBeat: nextStart}] : []),
      ...(segment.endBeat > nextEnd ? [{...segment, startBeat: nextEnd}] : []),
    ];
  });
  next.push({id: segmentId(groupId, takeId, nextStart, nextEnd), takeId, startBeat: nextStart, endBeat: nextEnd});
  return mergeAdjacentSegments(groupId, next.map(segment => ({
    ...segment,
    id: segmentId(groupId, segment.takeId, segment.startBeat, segment.endBeat),
  })));
}

function compSegmentsCoveringRange(
  groupId: string,
  takes: DAWBlock[],
  priority: DAWBlock[],
): RecordingCompSegment[] {
  if (takes.length === 0 || priority.length === 0) {
    return [];
  }
  const rangeStart = groupStartBeat(takes);
  const rangeEnd = groupEndBeat(takes);
  let uncovered: Array<{startBeat: number; endBeat: number}> = [{
    startBeat: rangeStart,
    endBeat: rangeEnd,
  }];
  const segments: RecordingCompSegment[] = [];

  priority.forEach(take => {
    const takeId = take.recordingTakeId ?? take.id;
    const takeStart = take.startBeat;
    const takeEnd = take.startBeat + take.lengthBeats;
    const nextUncovered: Array<{startBeat: number; endBeat: number}> = [];
    uncovered.forEach(range => {
      const startBeat = Math.max(range.startBeat, takeStart);
      const endBeat = Math.min(range.endBeat, takeEnd);
      if (endBeat > startBeat) {
        segments.push({
          id: segmentId(groupId, takeId, startBeat, endBeat),
          takeId,
          startBeat,
          endBeat,
        });
      }
      if (range.startBeat < startBeat) {
        nextUncovered.push({startBeat: range.startBeat, endBeat: startBeat});
      }
      if (endBeat < range.endBeat) {
        nextUncovered.push({startBeat: endBeat, endBeat: range.endBeat});
      }
    });
    uncovered = nextUncovered;
  });

  return mergeAdjacentSegments(groupId, segments);
}

function fadeForSegment(segment: RecordingCompSegment): number {
  return Math.min(RECORDING_COMP_CROSSFADE_BEATS, Math.max(0, (segment.endBeat - segment.startBeat) / 2));
}

export function materializeRecordingCompOutput(
  blocks: DAWBlock[],
  groupId: string,
  segments: RecordingCompSegment[],
  versionState?: {versions: RecordingCompVersion[]; activeVersionId: string},
): DAWBlock[] {
  const takes = compSourceTakeBlocks(blocks, groupId);
  const takeById = new Map(takes.map(take => [take.recordingTakeId ?? take.id, take]));
  const nextSegments = normalizedSegments(segments);
  const serializedSegments = nextSegments.map(segment => ({...segment}));
  const baseVersionState = versionState ?? compVersionState(blocks, groupId, serializedSegments);
  const activeVersionId = baseVersionState.activeVersionId;
  const recordingCompVersions = normalizedVersions(baseVersionState.versions).map(version =>
    version.id === activeVersionId
      ? {...version, segments: serializedSegments}
      : version,
  );
  const outputs = nextSegments.flatMap((segment, index) => {
    const take = takeById.get(segment.takeId);
    if (!take || take.type !== 'audio') {
      return [];
    }
    const localOffset = Math.max(0, segment.startBeat - take.startBeat);
    const lengthBeats = roundBeat(segment.endBeat - segment.startBeat);
    return [{
      ...take,
      id: outputBlockId(groupId, segment.takeId, segment.startBeat, segment.endBeat),
      name: 'Comp',
      startBeat: segment.startBeat,
      lengthBeats,
      sourceOffsetBeats: roundBeat((take.sourceOffsetBeats ?? 0) + localOffset),
      recordingTakeGroupId: undefined,
      recordingTakeId: undefined,
      recordingTakeIndex: undefined,
      recordingTakeActive: undefined,
      recordingCompGroupId: groupId,
      recordingCompSourceTakeId: segment.takeId,
      recordingCompSegmentId: segment.id,
      recordingCompSegments: serializedSegments,
      recordingCompVersions,
      activeRecordingCompVersionId: activeVersionId,
      isMuted: undefined,
      fadeInBeats: index > 0 ? fadeForSegment(segment) : take.fadeInBeats,
      fadeOutBeats: index < nextSegments.length - 1 ? fadeForSegment(segment) : take.fadeOutBeats,
    }];
  });
  return [
    ...blocks
      .filter(block => block.recordingCompGroupId !== groupId)
      .map(block => block.recordingTakeGroupId === groupId ? {...block, recordingTakeActive: false} : block),
    ...outputs,
  ];
}

export function blocksWithDefaultRecordingCompOutput(blocks: DAWBlock[], groupId: string): DAWBlock[] {
  return materializeRecordingCompOutput(blocks, groupId, defaultCompSegmentsForGroup(blocks, groupId));
}

export function switchRecordingCompVersionBlocks(
  blocks: DAWBlock[],
  groupId: string,
  versionId: string,
): DAWBlock[] {
  const state = compVersionState(blocks, groupId);
  const version = state.versions.find(item => item.id === versionId);
  if (!version) {
    return blocks;
  }
  return materializeRecordingCompOutput(blocks, groupId, version.segments, {
    versions: state.versions,
    activeVersionId: version.id,
  });
}

export function duplicateRecordingCompVersionBlocks(blocks: DAWBlock[], groupId: string): DAWBlock[] {
  const state = compVersionState(blocks, groupId);
  const active = state.versions.find(version => version.id === state.activeVersionId) ?? state.versions[0];
  if (!active) {
    return blocks;
  }
  const id = `${groupId}:version:${Date.now()}`;
  const versions = [
    ...state.versions,
    {
      id,
      name: compVersionName(state.versions.length),
      segments: active.segments.map(segment => ({...segment})),
    },
  ];
  return materializeRecordingCompOutput(blocks, groupId, active.segments, {
    versions,
    activeVersionId: id,
  });
}

export function renameRecordingCompVersionBlocks(
  blocks: DAWBlock[],
  groupId: string,
  versionId: string,
  name: string,
): DAWBlock[] {
  const state = compVersionState(blocks, groupId);
  const versions = state.versions.map(version =>
    version.id === versionId ? {...version, name: name.trim() || version.name} : version,
  );
  const active = versions.find(version => version.id === state.activeVersionId);
  return active
    ? materializeRecordingCompOutput(blocks, groupId, active.segments, {
        versions,
        activeVersionId: state.activeVersionId,
      })
    : blocks;
}
