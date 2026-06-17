import type {MediaImportBridge} from '../native/mediaImportApi';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';

export type RecordingCompFlattenResult =
  | {ok: true; blockId: string; path: string}
  | {ok: false; error: string};

function flattenedSingleClip(clip: DAWBlock): DAWBlock {
  return {
    ...clip,
    id: `${clip.recordingCompGroupId ?? clip.id}-flatten-${Date.now()}`,
    name: 'Flattened Comp',
    recordingTakeGroupId: undefined,
    recordingTakeId: undefined,
    recordingTakeIndex: undefined,
    recordingTakeActive: undefined,
    recordingCompGroupId: undefined,
    recordingCompSourceTakeId: undefined,
    recordingCompSegmentId: undefined,
    recordingCompSegments: undefined,
    recordingCompVersions: undefined,
    activeRecordingCompVersionId: undefined,
    isRecordingCompDisplayBlock: undefined,
    isMuted: false,
  };
}

export async function flattenRecordingCompGroupInPlace(
  groupId: string,
  bridge: MediaImportBridge | null,
): Promise<RecordingCompFlattenResult> {
  void bridge;
  const clips = useDAWStore.getState().blocks
    .filter(block => block.recordingCompGroupId === groupId && block.type === 'audio')
    .sort((left, right) => left.startBeat - right.startBeat);
  if (clips.length === 0) {
    return {ok: false, error: 'This take folder has no comp output to flatten.'};
  }
  if (clips.some(clip => clip.lengthBeats <= 0 || (!clip.audioFilePath && !clip.absoluteAudioFilePath))) {
    return {ok: false, error: 'The active comp contains an invalid audio slice.'};
  }
  if (clips.length === 1) {
    const block = flattenedSingleClip(clips[0]!);
    useDAWStore.getState().flattenRecordingCompGroup(groupId, block);
    return {ok: true, blockId: block.id, path: block.absoluteAudioFilePath ?? block.audioFilePath ?? ''};
  }
  return {
    ok: false,
    error: 'Flatten and Merge for edited multi-take comps is disabled until native slice rendering is hardened.',
  };
}
