import type {DAWBlock} from '../store/useDAWStore';

export type MediaConsolidationGroup = {
  sourcePath: string;
  blockIds: string[];
};

export function isProjectManagedAudioPath(relativePath: string | undefined): boolean {
  return Boolean(
    relativePath &&
    (relativePath.startsWith('imports/') || relativePath.startsWith('recordings/')),
  );
}

export function mediaConsolidationGroups(blocks: DAWBlock[]): MediaConsolidationGroup[] {
  const bySource = new Map<string, string[]>();
  for (const block of blocks) {
    if (
      block.type !== 'audio' ||
      block.isMissingMedia ||
      !block.absoluteAudioFilePath ||
      isProjectManagedAudioPath(block.audioFilePath)
    ) {
      continue;
    }

    const existing = bySource.get(block.absoluteAudioFilePath) ?? [];
    existing.push(block.id);
    bySource.set(block.absoluteAudioFilePath, existing);
  }

  return [...bySource.entries()].map(([sourcePath, blockIds]) => ({
    sourcePath,
    blockIds,
  }));
}
