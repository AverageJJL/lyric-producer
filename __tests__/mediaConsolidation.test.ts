import {mediaConsolidationGroups} from '../src/arrangement/mediaConsolidation';
import type {DAWBlock} from '../src/store/useDAWStore';

function audioBlock(
  id: string,
  audioFilePath: string | undefined,
  absoluteAudioFilePath: string | undefined,
  isMissingMedia = false,
): DAWBlock {
  return {
    id,
    trackId: 'track-audio',
    name: id,
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#64a5ff',
    audioFilePath,
    absoluteAudioFilePath,
    isMissingMedia,
  };
}

describe('media consolidation grouping', () => {
  it('groups external linked clips and skips project-managed or missing media', () => {
    const groups = mediaConsolidationGroups([
      audioBlock('external-a', undefined, '/external/loop.wav'),
      audioBlock('external-b', '../loop.wav', '/external/loop.wav'),
      audioBlock('imported', 'imports/already.wav', '/assets/imports/already.wav'),
      audioBlock('recorded', 'recordings/take.wav', '/assets/recordings/take.wav'),
      audioBlock('missing', undefined, '/external/missing.wav', true),
      audioBlock('unresolved', undefined, undefined),
    ]);

    expect(groups).toEqual([{
      sourcePath: '/external/loop.wav',
      blockIds: ['external-a', 'external-b'],
    }]);
  });
});
