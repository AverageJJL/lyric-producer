import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {analyzeSongSeedReference} from '../electron/songSeedReference';
import {writeReferenceCache} from '../electron/songSeedReferenceCache';
import type {SongSeedReferenceAnalysis, SongSeedReferenceSource, SongSeedTrack} from '../electron/songSeedTypes';

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

const track: SongSeedTrack = {
  id: 'mxm-halo',
  title: 'Halo',
  artist: 'Beyonce',
  hasLyrics: true,
  source: 'musixmatch',
};

const source: SongSeedReferenceSource = {
  kind: 'youtube',
  url: 'https://www.youtube.com/watch?v=yt-halo',
  videoId: 'yt-halo',
  title: 'Beyonce - Halo (Official Audio)',
  channelTitle: 'Beyonce - Topic',
  confidence: 0.94,
};

function youtubeFetches() {
  return [
    () => response({items: [{id: {videoId: source.videoId}}]}),
    () => response({items: [{
      id: source.videoId,
      snippet: {title: source.title, channelTitle: source.channelTitle},
      contentDetails: {duration: 'PT3M30S'},
    }]}),
  ];
}

function finishedTrack(id = 'cyanite-halo') {
  return {
    __typename: 'LibraryTrack',
    id,
    title: 'Halo - Beyonce',
    audioAnalysisV7: {
      __typename: 'AudioAnalysisV7Finished',
      result: {
        bpmRangeAdjusted: 122,
        keyPrediction: {value: 'A_MINOR'},
        transformerCaption: 'Bright pop with driving percussion.',
        valence: 0.7,
        arousal: 0.62,
        moodTags: ['happy', 'energetic'],
        moodAdvancedTags: ['uplifting'],
        movementTags: ['driving'],
        characterTags: ['bright'],
        advancedGenreTags: ['pop'],
        advancedSubgenreTags: ['popRap'],
        advancedInstrumentTagsExtended: ['percussion', 'synth'],
        voiceTags: ['female'],
        mood: {happy: 0.8, energetic: 0.66, calm: 0.1},
        advancedGenre: {pop: 0.9, rapHipHop: 0.24},
        advancedInstrumentPresenceExtended: {percussion: 'throughout', synth: 'frequently'},
        voice: {female: 0.85, male: 0.05, instrumental: 0.1},
        segments: {
          timestamps: [0, 15],
          valence: [0.6, 0.74],
          arousal: [0.5, 0.72],
          mood: {happy: [0.7, 0.8], energetic: [0.4, 0.73]},
          advancedGenre: {pop: [0.88, 0.91]},
          advancedInstrumentsExtended: {percussion: [0.8, 0.9], synth: [0.4, 0.66]},
          voice: {female: [0.8, 0.86], instrumental: [0.1, 0.08], male: [0.02, 0.03]},
        },
      },
    },
  };
}

function analysis(): SongSeedReferenceAnalysis {
  return {
    provider: 'cyanite',
    libraryTrackId: 'cached-halo',
    source,
    bpm: 122,
    key: 'A_MINOR',
    moodTags: ['happy'],
    moodAdvancedTags: [],
    movementTags: ['driving'],
    characterTags: [],
    genreTags: ['pop'],
    subgenreTags: [],
    instrumentTags: ['percussion'],
    voiceTags: ['female'],
    freeGenreTags: [],
    segments: [{timestamp: 0, mood: 'happy', arousal: 0.7}],
  };
}

describe('credit-safe Cyanite reference flow', () => {
  let root: string;
  let cachePath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-reference-cache-'));
    cachePath = path.join(root, 'cache.json');
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('uses the local cache without calling Cyanite enqueue', async () => {
    writeReferenceCache(cachePath, {track}, source, analysis());
    const fetchMock = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1]);

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'cache'});
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reuses a finished Cyanite library track before asking for a credit', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1])
      .mockImplementationOnce(() => response({data: {libraryTracks: {edges: [{node: finishedTrack()}]}}}))
      .mockImplementationOnce(() => response({data: {libraryTrackWaveform: {__typename: 'LibraryTrackWaveform', waveformUrl: 'https://waveform.example/h.json'}}}));

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'library', analysis: {libraryTrackId: 'cyanite-halo'}});
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('youTubeTrackEnqueue');
  });

  it('requires confirmation before enqueueing a new Cyanite analysis', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1])
      .mockImplementationOnce(() => response({data: {libraryTracks: {edges: []}}}));

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: false, code: 'confirmation_required', source: {videoId: source.videoId}});
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('youTubeTrackEnqueue');
  });

  it('enqueues after confirmation and stores a cache entry', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1])
      .mockImplementationOnce(() => response({data: {libraryTracks: {edges: []}}}))
      .mockImplementationOnce(() => response({data: {youTubeTrackEnqueue: {
        __typename: 'YouTubeTrackEnqueueSuccess',
        enqueuedLibraryTrack: {__typename: 'LibraryTrack', id: 'cyanite-new', title: 'Halo', audioAnalysisV7: {__typename: 'AudioAnalysisV7Processing'}},
      }}}))
      .mockImplementationOnce(() => response({data: {libraryTrack: finishedTrack('cyanite-new')}}))
      .mockImplementationOnce(() => response({data: {libraryTrackWaveform: {__typename: 'LibraryTrackWaveform', waveformUrl: 'https://waveform.example/h.json'}}}));

    const result = await analyzeSongSeedReference({track, allowCreditSpend: true}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});
    const cachedFetch = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1]);
    const cached = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt'}, cachedFetch as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'analyzed', analysis: {libraryTrackId: 'cyanite-new'}});
    expect(cached).toMatchObject({ok: true, cacheStatus: 'cache', analysis: {libraryTrackId: 'cyanite-new'}});
    expect(cachedFetch).toHaveBeenCalledTimes(2);
  });
});
