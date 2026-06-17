import {resolveProjectMediaReferences} from '../src/arrangement/projectMediaResolution';
import {emptyProjectSnapshot} from '../src/arrangement/projectSnapshot';
import type {ProjectSnapshot} from '../src/arrangement/projectSnapshot';

function audioSnapshot(): ProjectSnapshot {
  return {
    ...emptyProjectSnapshot(),
    tracks: [{
      id: 'track-a',
      name: 'Audio',
      isMuted: false,
      isSolo: false,
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isRecordArmed: false,
      isLocked: false,
    }],
    blocks: [
      {
        id: 'clip-found',
        trackId: 'track-a',
        name: 'Found',
        startBeat: 0,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
        audioFilePath: 'imports/found.wav',
      },
      {
        id: 'clip-missing',
        trackId: 'track-a',
        name: 'Missing',
        startBeat: 4,
        lengthBeats: 4,
        type: 'audio',
        color: '#c45c26',
        audioFilePath: 'imports/missing.wav',
      },
    ],
    mediaReferences: [
      {
        clipId: 'clip-found',
        trackId: 'track-a',
        kind: 'audio',
        name: 'Found',
        relativePath: 'imports/found.wav',
      },
      {
        clipId: 'clip-missing',
        trackId: 'track-a',
        kind: 'audio',
        name: 'Missing',
        relativePath: 'imports/missing.wav',
      },
    ],
  };
}

describe('project media resolution', () => {
  it('resolves found audio clips and marks missing clips', async () => {
    const bridge = {
      importAudio: jest.fn(),
      resolveAudioMedia: jest.fn(async () => ({
        ok: true as const,
        resolved: [
          {
            clipId: 'clip-found',
            exists: true,
            relativePath: 'imports/found.wav',
            absolutePath: '/tmp/assets/imports/found.wav',
          },
          {
            clipId: 'clip-missing',
            exists: false,
            relativePath: 'imports/missing.wav',
          },
        ],
      })),
    };

    const result = await resolveProjectMediaReferences(bridge, audioSnapshot());

    expect(result.resolvedMediaCount).toBe(1);
    expect(result.missingMediaCount).toBe(1);
    expect(result.snapshot.blocks[0]).toMatchObject({
      id: 'clip-found',
      isMissingMedia: false,
      absoluteAudioFilePath: '/tmp/assets/imports/found.wav',
    });
    expect(result.snapshot.blocks[1]).toMatchObject({
      id: 'clip-missing',
      isMissingMedia: true,
      missingMediaReason: 'Audio file could not be found.',
    });
  });
});
