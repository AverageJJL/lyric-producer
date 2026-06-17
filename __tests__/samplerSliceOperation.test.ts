import {applyArrangementOperations} from '../src/arrangement/operations';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tracks: [],
    patterns: {},
    blocks: [{
      id: 'clip-source',
      trackId: 'track-audio',
      name: 'Break',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#c45c26',
      audioFilePath: 'imports/break.wav',
      sourceLengthBeats: 4,
      durationSeconds: 2,
    }],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    syncSource: 'ui',
    timeSignature: {numerator: 4, denominator: 4},
  });
}

describe('sampler slice arrangement operation', () => {
  beforeEach(resetStore);

  it('creates a sliced sampler track and MIDI trigger clip from an audio source', () => {
    const snapshot = applyArrangementOperations([{
      op: 'createSamplerFromSlices',
      sourceClipId: 'clip-source',
      trackId: 'track-sampler',
      trackName: 'Break Sampler',
      clipId: 'clip-sampler-midi',
      clipName: 'Chops',
      startBeat: 8,
      slices: [
        {name: 'One', sourceStartBeat: 0, sourceLengthBeats: 0.5, triggerNote: 48},
        {name: 'Two', sourceStartBeat: 1, sourceLengthBeats: 0.5, triggerNote: 49, clipStartBeat: 0.5},
      ],
    }], {skipNativeRefresh: true});

    expect(snapshot.tracks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'track-sampler',
        instrumentId: 'sampler_slices',
        presetId: 'ai_sliced_sampler',
        samplerRegions: [
          expect.objectContaining({name: 'One', rootNote: 48, sourceStartSeconds: 0}),
          expect.objectContaining({name: 'Two', rootNote: 49, sourceStartSeconds: 0.5}),
        ],
      }),
    ]));
    expect(snapshot.blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'clip-sampler-midi',
        trackId: 'track-sampler',
        type: 'midi',
        startBeat: 8,
        notes: [
          {note: 48, velocity: 100, startBeat: 0, lengthBeats: 0.5},
          {note: 49, velocity: 100, startBeat: 0.5, lengthBeats: 0.5},
        ],
      }),
    ]));
    expect(captureProjectSnapshot().tracks[0]?.samplerRegions?.[0]).not.toBe(
      snapshot.tracks[0]?.samplerRegions?.[0],
    );
  });
});
