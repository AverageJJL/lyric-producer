import type {MediaImportBridge} from '../native/mediaImportApi';
import type {DAWBlock} from '../store/useDAWStore';
import type {ProjectMediaReference, ProjectSnapshot} from './projectSnapshot';

export type ProjectMediaResolutionResult = {
  snapshot: ProjectSnapshot;
  missingMediaCount: number;
  resolvedMediaCount: number;
};

function audioReferences(snapshot: ProjectSnapshot): ProjectMediaReference[] {
  return snapshot.mediaReferences.filter(reference => reference.kind === 'audio');
}

function markBlockResolved(
  block: DAWBlock,
  resolution: {relativePath?: string; absolutePath?: string},
): DAWBlock {
  return {
    ...block,
    audioFilePath: resolution.relativePath ?? block.audioFilePath,
    absoluteAudioFilePath: resolution.absolutePath ?? block.absoluteAudioFilePath,
    isMissingMedia: false,
    missingMediaReason: undefined,
  };
}

function markBlockMissing(block: DAWBlock): DAWBlock {
  return {
    ...block,
    isMissingMedia: true,
    missingMediaReason: 'Audio file could not be found.',
  };
}

export async function resolveProjectMediaReferences(
  bridge: MediaImportBridge | null,
  snapshot: ProjectSnapshot,
): Promise<ProjectMediaResolutionResult> {
  const references = audioReferences(snapshot);
  if (references.length === 0 || !bridge?.resolveAudioMedia) {
    return {snapshot, missingMediaCount: 0, resolvedMediaCount: 0};
  }

  const response = await bridge.resolveAudioMedia({
    references: references.map(reference => ({
      clipId: reference.clipId,
      trackId: reference.trackId,
      relativePath: reference.relativePath,
      absolutePath: reference.absolutePath,
    })),
  });
  if (!response.ok) {
    return {snapshot, missingMediaCount: 0, resolvedMediaCount: 0};
  }

  const byClipId = new Map(response.resolved.map(item => [item.clipId, item]));
  let missingMediaCount = 0;
  let resolvedMediaCount = 0;
  const blocks = snapshot.blocks.map(block => {
    const resolution = byClipId.get(block.id);
    if (!resolution) {
      return block;
    }
    if (!resolution.exists) {
      missingMediaCount += 1;
      return markBlockMissing(block);
    }
    resolvedMediaCount += 1;
    return markBlockResolved(block, resolution);
  });

  return {
    snapshot: {...snapshot, blocks},
    missingMediaCount,
    resolvedMediaCount,
  };
}
