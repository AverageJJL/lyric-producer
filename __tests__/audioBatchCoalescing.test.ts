import {coalesceAudioBatchPayloads} from '../src/native/audioBatchCoalescing';

function clip(id: string, startBeat: number, lengthBeats: number, gain = 0) {
  return {
    blockId: id,
    payload: {
      clipId: id,
      trackId: 'track-a',
      startBeat,
      lengthBeats,
      name: id,
      sourceOffsetBeats: startBeat,
      sourceLengthBeats: 52,
      clipGainDb: gain,
      fadeInBeats: 0,
      fadeOutBeats: 0,
      isReversed: false,
      audioFilePath: 'imports/stem.wav',
      absoluteAudioFilePath: '/tmp/stem.wav',
    },
  };
}

describe('audio batch coalescing', () => {
  it('merges contiguous identical slices into one native playback clip', () => {
    const [merged] = coalesceAudioBatchPayloads([
      clip('slice-a', 0, 8),
      clip('slice-b', 8, 16),
      clip('slice-c', 24, 8),
    ]);

    expect(merged).toMatchObject({
      coalesced: true,
      memberBlockIds: ['slice-a', 'slice-b', 'slice-c'],
      payload: {
        clipId: 'slice-a__playback_3',
        startBeat: 0,
        lengthBeats: 32,
        sourceOffsetBeats: 0,
      },
    });
  });

  it('keeps gain changes as separate native clips', () => {
    const groups = coalesceAudioBatchPayloads([
      clip('slice-a', 0, 8),
      clip('slice-b', 8, 8, -10),
      clip('slice-c', 16, 8),
    ]);

    expect(groups.map(group => group.memberBlockIds)).toEqual([
      ['slice-a'],
      ['slice-b'],
      ['slice-c'],
    ]);
  });

  it('does not merge gapped or reversed clips', () => {
    const gapped = coalesceAudioBatchPayloads([
      clip('slice-a', 0, 8),
      clip('slice-b', 12, 8),
    ]);
    const reversed = coalesceAudioBatchPayloads([
      clip('slice-a', 0, 8),
      {
        ...clip('slice-b', 8, 8),
        payload: {...clip('slice-b', 8, 8).payload, isReversed: true},
      },
    ]);

    expect(gapped.map(group => group.memberBlockIds)).toEqual([['slice-a'], ['slice-b']]);
    expect(reversed.map(group => group.memberBlockIds)).toEqual([['slice-a'], ['slice-b']]);
  });
});
