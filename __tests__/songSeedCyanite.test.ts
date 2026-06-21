import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {analyzeCyaniteReferenceFile, isCyaniteMp3Path} from '../electron/songSeedCyanite';
import {analyzeCyaniteYouTubeReference} from '../electron/songSeedCyaniteYoutube';
import {cyaniteAnalysisStatus, normalizeCyaniteAnalysis} from '../electron/songSeedCyaniteNormalize';

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

type ReadableLike = {
  resume: () => void;
  on: (event: 'end' | 'error', callback: (error?: Error) => void) => void;
};

function readableLike(value: unknown): value is ReadableLike {
  return Boolean(value
    && typeof value === 'object'
    && typeof (value as ReadableLike).resume === 'function'
    && typeof (value as ReadableLike).on === 'function');
}

async function consumeUploadBody(body: unknown) {
  if (!readableLike(body)) return;
  await new Promise<void>((resolve, reject) => {
    body.on('error', error => reject(error ?? new Error('Upload stream failed.')));
    body.on('end', () => resolve());
    body.resume();
  });
}

async function uploadOk(_url?: unknown, init?: RequestInit) {
  await consumeUploadBody(init?.body);
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
  } as Response;
}

function finishedTrack(id = 'track-1') {
  return {
    __typename: 'LibraryTrack',
    id,
    title: 'Reference',
    audioAnalysisV7: {
      __typename: 'AudioAnalysisV7Finished',
      result: {
        bpmRangeAdjusted: 122,
        keyPrediction: {value: 'aMinor'},
        timeSignature: '4/4',
        transformerCaption: 'Dark energetic synth pop.',
        valence: -0.22,
        arousal: 0.74,
        energyLevel: 'HIGH',
        energyDynamics: 'MEDIUM',
        moodTags: ['dark', 'energetic'],
        moodAdvancedTags: ['tense'],
        movementTags: ['driving'],
        characterTags: ['mysterious'],
        advancedGenreTags: ['electronicDance'],
        advancedSubgenreTags: ['synthPop'],
        advancedInstrumentTagsExtended: ['synth', 'percussion'],
        mood: {dark: 0.91, energetic: 0.84, calm: 0.02},
        segments: {
          timestamps: [0, 15],
          valence: [-0.3, 0.1],
          arousal: [0.7, 0.8],
          mood: {
            dark: [0.9, 0.2],
            energetic: [0.4, 0.88],
            calm: [0.01, 0.02],
          },
        },
      },
    },
  };
}

const youtubeSource = {
  kind: 'youtube' as const,
  url: 'https://www.youtube.com/watch?v=official',
  videoId: 'official',
  title: 'Beyonce - Halo (Official Audio)',
  channelTitle: 'Beyonce - Topic',
  confidence: 0.94,
};

describe('Cyanite song seed provider', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-cyanite-'));
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('normalizes finished Cyanite analysis into app-owned reference metadata', () => {
    expect(normalizeCyaniteAnalysis(finishedTrack())).toMatchObject({
      provider: 'cyanite',
      libraryTrackId: 'track-1',
      title: 'Reference',
      bpm: 122,
      key: 'aMinor',
      moodTags: ['dark', 'energetic'],
      movementTags: ['driving'],
      instrumentTags: ['synth', 'percussion'],
      segments: [
        expect.objectContaining({timestamp: 0, mood: 'dark'}),
        expect.objectContaining({timestamp: 15, mood: 'energetic'}),
      ],
    });
  });

  it('reports processing and failed analysis states', () => {
    expect(cyaniteAnalysisStatus({
      id: 'track-2',
      audioAnalysisV7: {__typename: 'AudioAnalysisV7Processing'},
    })).toEqual({status: 'processing'});
    expect(cyaniteAnalysisStatus({
      id: 'track-3',
      audioAnalysisV7: {__typename: 'AudioAnalysisV7Failed', error: {message: 'Bad file'}},
    })).toEqual({status: 'failed', error: 'Bad file'});
  });

  it('validates MP3 input before network access', async () => {
    const wavPath = path.join(root, 'reference.wav');
    fs.writeFileSync(wavPath, 'not mp3');

    expect(isCyaniteMp3Path(wavPath)).toBe(false);
    await expect(analyzeCyaniteReferenceFile(
      {filePath: wavPath},
      {CYANITE_ACCESS_TOKEN: 'token'},
      jest.fn() as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'invalid_file'});
  });

  it('requires a Cyanite token', async () => {
    const mp3Path = path.join(root, 'reference.mp3');
    fs.writeFileSync(mp3Path, 'mp3 bytes');

    await expect(analyzeCyaniteReferenceFile(
      {filePath: mp3Path},
      {},
      jest.fn() as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'missing_key'});
  });

  it('uploads a new library track and polls until V7 analysis finishes', async () => {
    const mp3Path = path.join(root, 'reference.mp3');
    fs.writeFileSync(mp3Path, 'mp3 bytes');
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => response({data: {libraryTracks: {edges: []}}}))
      .mockImplementationOnce(() => response({data: {fileUploadRequest: {id: 'upload-1', uploadUrl: 'https://upload.example/mp3'}}}))
      .mockImplementationOnce((url, init) => uploadOk(url, init))
      .mockImplementationOnce(() => response({data: {libraryTrackCreate: {__typename: 'LibraryTrackCreateSuccess', createdLibraryTrack: {id: 'track-new'}}}}))
      .mockImplementationOnce(() => response({data: {libraryTrack: {__typename: 'LibraryTrack', id: 'track-new', title: 'Reference', audioAnalysisV7: {__typename: 'AudioAnalysisV7Processing'}}}}))
      .mockImplementationOnce(() => response({data: {libraryTrack: finishedTrack('track-new')}}));

    const result = await analyzeCyaniteReferenceFile(
      {filePath: mp3Path, title: 'Reference'},
      {CYANITE_ACCESS_TOKEN: 'token'},
      fetchMock as typeof fetch,
      {pollIntervalMs: 0, timeoutMs: 1000},
    );

    if (!result.ok) {
      throw new Error(`${result.code}: ${result.error}`);
    }
    expect(result).toMatchObject({
      ok: true,
      analysis: expect.objectContaining({libraryTrackId: 'track-new', moodTags: ['dark', 'energetic']}),
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });

  it('enqueues a YouTube track and polls until V7 analysis finishes', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => response({data: {youTubeTrackEnqueue: {
        __typename: 'YouTubeTrackEnqueueSuccess',
        enqueuedLibraryTrack: {__typename: 'LibraryTrack', id: 'track-youtube', title: 'Halo', audioAnalysisV7: {__typename: 'AudioAnalysisV7Processing'}},
      }}}))
      .mockImplementationOnce(() => response({data: {libraryTrack: finishedTrack('track-youtube')}}));

    const result = await analyzeCyaniteYouTubeReference(
      youtubeSource,
      {CYANITE_ACCESS_TOKEN: 'token'},
      fetchMock as typeof fetch,
      {pollIntervalMs: 0, timeoutMs: 1000},
    );

    expect(result).toMatchObject({
      ok: true,
      analysis: expect.objectContaining({
        libraryTrackId: 'track-youtube',
        source: expect.objectContaining({videoId: 'official'}),
      }),
    });
  });

  it.each([
    ['invalidYouTubeLink', 'invalid_file'],
    ['videoDurationExceeded', 'invalid_file'],
    ['limitExceeded', 'limit_exceeded'],
  ])('maps YouTube enqueue error %s', async (code, expected) => {
    const fetchMock = jest.fn().mockImplementationOnce(() => response({data: {youTubeTrackEnqueue: {
      __typename: 'YouTubeTrackEnqueueError',
      code,
      message: code,
    }}}));

    await expect(analyzeCyaniteYouTubeReference(
      youtubeSource,
      {CYANITE_ACCESS_TOKEN: 'token'},
      fetchMock as typeof fetch,
      {pollIntervalMs: 0, timeoutMs: 1000},
    )).resolves.toMatchObject({ok: false, code: expected});
  });

  it('maps HTTP payment-required responses to Cyanite credit exhaustion', async () => {
    await expect(analyzeCyaniteYouTubeReference(
      youtubeSource,
      {CYANITE_ACCESS_TOKEN: 'token'},
      jest.fn(() => response({}, 402)) as typeof fetch,
      {pollIntervalMs: 0, timeoutMs: 1000},
    )).resolves.toMatchObject({ok: false, code: 'limit_exceeded'});
  });
});
