import {
  collectMediaSourceInventory,
  mediaSourceClipCountLabel,
  mediaSourceLocationLabel,
  mediaSourceStatusLabel,
} from '../src/arrangement/mediaSourceInventory';
import type {DAWBlock} from '../src/store/useDAWStore';

function audioBlock(id: string, overrides: Partial<DAWBlock> = {}): DAWBlock {
  return {
    id,
    trackId: 'track-audio',
    name: id,
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#64a5ff',
    ...overrides,
  };
}

describe('media source inventory', () => {
  it('groups audio clips by absolute source path and exposes source metadata', () => {
    const inventory = collectMediaSourceInventory([
      audioBlock('clip-a', {
        audioFilePath: 'imports/shared.wav',
        absoluteAudioFilePath: '/tmp/project/imports/shared.wav',
        mediaSourceName: 'Shared Source',
        sourceSampleRate: 48000,
      }),
      audioBlock('clip-b', {
        audioFilePath: 'imports/alternate.wav',
        absoluteAudioFilePath: '/tmp/project/imports/shared.wav',
      }),
      audioBlock('clip-c', {
        audioFilePath: 'imports/warning.wav',
        mediaValidationWarning: 'Sample rate mismatch.',
      }),
    ]);

    expect(inventory).toHaveLength(2);
    expect(inventory[0]).toMatchObject({
      name: 'Shared Source',
      clipCount: 2,
      isProjectManaged: true,
      representativeBlockId: 'clip-a',
      revealPath: '/tmp/project/imports/shared.wav',
      sampleRate: 48000,
      status: 'linked',
    });
    expect(inventory[0]?.blocks.map(block => block.id)).toEqual(['clip-a', 'clip-b']);
    expect(mediaSourceStatusLabel(inventory[0]!.status)).toBe('Linked');
    expect(mediaSourceClipCountLabel(inventory[0]!.clipCount)).toBe('2 clips');
    expect(mediaSourceLocationLabel(inventory[0]!)).toBe('Project-managed');
  });

  it('uses missing status before warnings and keeps unresolved missing clips visible', () => {
    const inventory = collectMediaSourceInventory([
      audioBlock('missing-a', {
        isMissingMedia: true,
        mediaValidationWarning: 'Sample rate mismatch.',
      }),
      audioBlock('external-a', {
        absoluteAudioFilePath: '/external/loop.wav',
      }),
    ]);

    expect(inventory).toHaveLength(2);
    expect(inventory[0]).toMatchObject({
      sourceKey: 'missing:missing-a',
      sourcePath: 'No source path',
      status: 'missing',
      revealPath: undefined,
    });
    expect(mediaSourceStatusLabel(inventory[0]!.status)).toBe('Missing');
    expect(mediaSourceLocationLabel(inventory[0]!)).toBe('Offline');
    expect(mediaSourceLocationLabel(inventory[1]!)).toBe('External');
  });
});
