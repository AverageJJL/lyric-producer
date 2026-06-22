type AudioBatchInput = {
  blockId: string;
  payload: Record<string, unknown>;
};

export type CoalescedAudioBatchPayload = {
  payload: Record<string, unknown>;
  memberBlockIds: string[];
  coalesced: boolean;
};

type ParsedBatchClip = {
  blockId: string;
  payload: Record<string, unknown>;
  clipId: string;
  trackId: string;
  fileKey: string;
  startBeat: number;
  lengthBeats: number;
  sourceOffsetBeats: number;
  sourceLengthBeats: number;
  clipGainDb: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  isReversed: boolean;
};

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) < 0.000001;
}

function parseClip(input: AudioBatchInput): ParsedBatchClip | null {
  const clipId = stringValue(input.payload.clipId);
  const trackId = stringValue(input.payload.trackId);
  const audioFilePath = stringValue(input.payload.audioFilePath);
  if (!clipId || !trackId || !audioFilePath) {
    return null;
  }
  const startBeat = numberValue(input.payload.startBeat, 0);
  const lengthBeats = numberValue(input.payload.lengthBeats, 0);
  if (lengthBeats <= 0) {
    return null;
  }
  return {
    blockId: input.blockId,
    payload: input.payload,
    clipId,
    trackId,
    fileKey: stringValue(input.payload.absoluteAudioFilePath) ?? audioFilePath,
    startBeat,
    lengthBeats,
    sourceOffsetBeats: numberValue(input.payload.sourceOffsetBeats, 0),
    sourceLengthBeats: numberValue(input.payload.sourceLengthBeats, lengthBeats),
    clipGainDb: numberValue(input.payload.clipGainDb, 0),
    fadeInBeats: numberValue(input.payload.fadeInBeats, 0),
    fadeOutBeats: numberValue(input.payload.fadeOutBeats, 0),
    isReversed: booleanValue(input.payload.isReversed),
  };
}

function canAppend(group: ParsedBatchClip[], next: ParsedBatchClip): boolean {
  const previous = group[group.length - 1];
  if (!previous || previous.isReversed || next.isReversed) {
    return false;
  }
  return previous.trackId === next.trackId &&
    previous.fileKey === next.fileKey &&
    nearlyEqual(previous.clipGainDb, next.clipGainDb) &&
    nearlyEqual(previous.sourceLengthBeats, next.sourceLengthBeats) &&
    nearlyEqual(previous.startBeat + previous.lengthBeats, next.startBeat) &&
    nearlyEqual(previous.sourceOffsetBeats + previous.lengthBeats, next.sourceOffsetBeats) &&
    nearlyEqual(previous.fadeOutBeats, 0) &&
    nearlyEqual(next.fadeInBeats, 0);
}

function playbackClipId(group: ParsedBatchClip[]): string {
  return `${group[0]?.clipId ?? 'audio'}__playback_${group.length}`;
}

function coalescedPayload(group: ParsedBatchClip[]): CoalescedAudioBatchPayload {
  if (group.length === 1) {
    return {
      payload: group[0]!.payload,
      memberBlockIds: [group[0]!.blockId],
      coalesced: false,
    };
  }

  const first = group[0]!;
  const last = group[group.length - 1]!;
  return {
    payload: {
      ...first.payload,
      clipId: playbackClipId(group),
      name: `${first.payload.name ?? first.clipId} playback`,
      startBeat: first.startBeat,
      lengthBeats: (last.startBeat + last.lengthBeats) - first.startBeat,
      sourceOffsetBeats: first.sourceOffsetBeats,
      sourceLengthBeats: first.sourceLengthBeats,
      clipGainDb: first.clipGainDb,
      fadeInBeats: first.fadeInBeats,
      fadeOutBeats: last.fadeOutBeats,
    },
    memberBlockIds: group.map(item => item.blockId),
    coalesced: true,
  };
}

export function coalesceAudioBatchPayloads(
  items: AudioBatchInput[],
): CoalescedAudioBatchPayload[] {
  const parsed = items.map(parseClip);
  if (parsed.some(item => item === null)) {
    return items.map(item => ({
      payload: item.payload,
      memberBlockIds: [item.blockId],
      coalesced: false,
    }));
  }

  const sorted = (parsed as ParsedBatchClip[]).sort((left, right) =>
    left.trackId.localeCompare(right.trackId) ||
    left.fileKey.localeCompare(right.fileKey) ||
    left.startBeat - right.startBeat,
  );
  const groups: ParsedBatchClip[][] = [];
  sorted.forEach(item => {
    const current = groups[groups.length - 1];
    if (current && canAppend(current, item)) {
      current.push(item);
      return;
    }
    groups.push([item]);
  });

  return groups.map(coalescedPayload);
}
