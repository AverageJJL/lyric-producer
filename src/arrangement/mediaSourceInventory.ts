import type {DAWBlock} from '../store/useDAWStore';
import {isProjectManagedAudioPath} from './mediaConsolidation';

export type MediaSourceStatus = 'linked' | 'warning' | 'missing';

export type MediaSourceInventoryItem = {
  sourceKey: string;
  name: string;
  sourcePath: string;
  status: MediaSourceStatus;
  clipCount: number;
  blocks: DAWBlock[];
  isProjectManaged: boolean;
  representativeBlockId: string;
  revealPath?: string;
  sampleRate?: number;
};

function sourceIdentity(block: DAWBlock): string | null {
  if (block.type !== 'audio') {
    return null;
  }
  if (block.absoluteAudioFilePath) {
    return `absolute:${block.absoluteAudioFilePath}`;
  }
  if (block.audioFilePath) {
    return `relative:${block.audioFilePath}`;
  }
  return block.isMissingMedia ? `missing:${block.id}` : null;
}

function sourcePath(block: DAWBlock): string {
  return block.audioFilePath ?? block.absoluteAudioFilePath ?? 'No source path';
}

function sourceStatus(blocks: DAWBlock[]): MediaSourceStatus {
  if (blocks.some(block => block.isMissingMedia)) {
    return 'missing';
  }
  if (blocks.some(block => block.mediaValidationWarning)) {
    return 'warning';
  }
  return 'linked';
}

function firstSampleRate(blocks: DAWBlock[]): number | undefined {
  return blocks.find(block =>
    typeof block.sourceSampleRate === 'number' &&
    Number.isFinite(block.sourceSampleRate) &&
    block.sourceSampleRate > 0,
  )?.sourceSampleRate;
}

export function mediaSourceStatusLabel(status: MediaSourceStatus): string {
  switch (status) {
    case 'missing':
      return 'Missing';
    case 'warning':
      return 'Warning';
    case 'linked':
      return 'Linked';
  }
}

export function mediaSourceClipCountLabel(clipCount: number): string {
  return `${clipCount} ${clipCount === 1 ? 'clip' : 'clips'}`;
}

export function mediaSourceLocationLabel(item: MediaSourceInventoryItem): string {
  if (item.isProjectManaged) {
    return 'Project-managed';
  }
  if (item.revealPath) {
    return 'External';
  }
  return item.status === 'missing' ? 'Offline' : 'Unresolved';
}

export function collectMediaSourceInventory(blocks: DAWBlock[]): MediaSourceInventoryItem[] {
  const groups = new Map<string, DAWBlock[]>();

  for (const block of blocks) {
    const key = sourceIdentity(block);
    if (!key) {
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), block]);
  }

  return [...groups.entries()].map(([sourceKey, sourceBlocks]) => {
    const representative = sourceBlocks[0]!;
    const status = sourceStatus(sourceBlocks);
    const isProjectManaged = sourceBlocks.some(block =>
      isProjectManagedAudioPath(block.audioFilePath),
    );
    return {
      sourceKey,
      name: representative.mediaSourceName ?? representative.name,
      sourcePath: sourcePath(representative),
      status,
      clipCount: sourceBlocks.length,
      blocks: sourceBlocks,
      isProjectManaged,
      representativeBlockId: representative.id,
      revealPath: sourceBlocks.find(block => block.absoluteAudioFilePath && !block.isMissingMedia)
        ?.absoluteAudioFilePath,
      sampleRate: firstSampleRate(sourceBlocks),
    };
  });
}
