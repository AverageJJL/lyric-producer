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

function seedAnalysis(libraryTrackId: string, referenceSource: SongSeedReferenceSource): SongSeedReferenceAnalysis {
  return {...analysis(), libraryTrackId, source: referenceSource, title: referenceSource.title};
}

function writeSeedCache(
  seedPath: string,
  entries: Array<{key: string; analysisId: string; analysis: SongSeedReferenceAnalysis}>,
): void {
  const analyses: Record<string, SongSeedReferenceAnalysis> = {};
  const keyedEntries: Record<string, {savedAt: string; analysisId: string}> = {};
  for (const entry of entries) {
    analyses[entry.analysisId] = entry.analysis;
    keyedEntries[entry.key] = {savedAt: '2026-06-20T00:00:00.000Z', analysisId: entry.analysisId};
  }
  fs.mkdirSync(path.dirname(seedPath), {recursive: true});
  fs.writeFileSync(seedPath, JSON.stringify({version: 1, analyses, entries: keyedEntries}), 'utf8');
}

describe('credit-safe Cyanite reference flow', () => {
  let root: string;
  let cachePath: string;
  let seedCachePath: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-reference-cache-'));
    cachePath = path.join(root, 'cache.json');
    seedCachePath = path.join(root, 'seed.json');
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('uses the local cache without calling providers', async () => {
    writeReferenceCache(cachePath, {track}, source, analysis());
    const fetchMock = jest.fn();

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'cache'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses bundled Baby seed analysis before YouTube or Cyanite calls', async () => {
    const babySource = {
      kind: 'youtube' as const,
      url: 'https://www.youtube.com/watch?v=kffacxfA7G4',
      videoId: 'kffacxfA7G4',
      title: 'Justin Bieber - Baby ft. Ludacris',
      channelTitle: 'JustinBieberVEVO',
      confidence: 0.72,
    };
    writeSeedCache(seedCachePath, [
      {key: 'song:baby:justin bieber', analysisId: 'baby', analysis: seedAnalysis('seed-baby', babySource)},
    ]);
    const fetchMock = jest.fn();

    const result = await analyzeSongSeedReference({title: 'Baby', artist: 'Justin Bieber'}, {}, fetchMock as typeof fetch, {cachePath, seedCachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'cache', analysis: {libraryTrackId: 'seed-baby', source: {videoId: 'kffacxfA7G4'}}});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses bundled Blank Space seed analysis before YouTube or Cyanite calls', async () => {
    const blankSpaceSource = {
      kind: 'youtube' as const,
      url: 'https://www.youtube.com/watch?v=TOanjmNxKEI',
      videoId: 'TOanjmNxKEI',
      title: 'Taylor Swift - Blank Space (Official Video) | Espa\u00f1ol & English',
      channelTitle: 'w i l d e s t d r e a m s',
      confidence: 0.7,
    };
    writeSeedCache(seedCachePath, [
      {key: 'song:blank space:taylor swift', analysisId: 'blank-space', analysis: seedAnalysis('seed-blank-space', blankSpaceSource)},
    ]);
    const fetchMock = jest.fn();

    const result = await analyzeSongSeedReference({title: 'Blank Space', artist: 'Taylor Swift'}, {}, fetchMock as typeof fetch, {cachePath, seedCachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'cache', analysis: {libraryTrackId: 'seed-blank-space', source: {videoId: 'TOanjmNxKEI'}}});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefers writable cache entries over bundled seed entries', async () => {
    const seedSource = {...source, videoId: 'seed-video'};
    const writableSource = {...source, videoId: 'writable-video'};
    writeSeedCache(seedCachePath, [
      {key: 'song:halo:beyonce', analysisId: 'seed-halo', analysis: seedAnalysis('seed-halo', seedSource)},
    ]);
    writeReferenceCache(cachePath, {track}, writableSource, {...analysis(), libraryTrackId: 'writable-halo'});
    const fetchMock = jest.fn();

    const result = await analyzeSongSeedReference({track}, {}, fetchMock as typeof fetch, {cachePath, seedCachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'cache', analysis: {libraryTrackId: 'writable-halo', source: {videoId: 'writable-video'}}});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reuses a finished Cyanite library track before enqueueing a new analysis', async () => {
    const fetchMock = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1])
      .mockImplementationOnce(() => response({data: {libraryTracks: {edges: [{node: finishedTrack()}]}}}))
      .mockImplementationOnce(() => response({data: {libraryTrackWaveform: {__typename: 'LibraryTrackWaveform', waveformUrl: 'https://waveform.example/h.json'}}}));

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'library', analysis: {libraryTrackId: 'cyanite-halo'}});
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('youTubeTrackEnqueue');
  });

  it('enqueues a new Cyanite analysis without a confirmation round trip', async () => {
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

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'analyzed', analysis: {libraryTrackId: 'cyanite-new'}});
    expect(JSON.stringify(fetchMock.mock.calls)).toContain('youTubeTrackEnqueue');
  });

  it('blocks live provider lookup in public demo mode after cache misses', async () => {
    const fetchMock = jest.fn();

    const result = await analyzeSongSeedReference(
      {track, allowCreditSpend: true},
      {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'},
      fetchMock as typeof fetch,
      {cachePath, seedCachePath, demoMode: true, demoLimitMessage: 'Demo Cyanite limit reached.'},
    );

    expect(result).toEqual({ok: false, code: 'limit_exceeded', error: 'Demo Cyanite limit reached.'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('stores a cache entry after automatic enqueue', async () => {
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

    const result = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt', CYANITE_ACCESS_TOKEN: 'token'}, fetchMock as typeof fetch, {cachePath});
    const cachedFetch = jest.fn()
      .mockImplementationOnce(youtubeFetches()[0])
      .mockImplementationOnce(youtubeFetches()[1]);
    const cached = await analyzeSongSeedReference({track}, {YOUTUBE_API_KEY: 'yt'}, cachedFetch as typeof fetch, {cachePath});

    expect(result).toMatchObject({ok: true, cacheStatus: 'analyzed', analysis: {libraryTrackId: 'cyanite-new'}});
    expect(cached).toMatchObject({ok: true, cacheStatus: 'cache', analysis: {libraryTrackId: 'cyanite-new'}});
    expect(cachedFetch).not.toHaveBeenCalled();
  });
});
