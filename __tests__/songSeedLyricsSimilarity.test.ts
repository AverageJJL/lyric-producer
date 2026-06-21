import {checkLyricsSimilarity} from '../electron/songSeedLyricsSimilarity';

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

function searchPayload() {
  return {
    message: {
      body: {
        track_list: [{
          track: {
            track_id: 123,
            track_name: 'Existing Song',
            artist_name: 'Known Writer',
            has_lyrics: 1,
          },
        }],
      },
    },
  };
}

function lyricsPayload() {
  return {
    message: {
      body: {
        lyrics: {
          lyrics_body: 'remember those walls i built\nwell baby they are tumbling down',
        },
      },
    },
  };
}

describe('song seed lyric similarity', () => {
  it('requires provider credentials', async () => {
    await expect(checkLyricsSimilarity(
      {lyrics: 'remember those walls i built'},
      {},
      jest.fn() as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'missing_key'});
  });

  it('searches lyric phrases and returns sanitized match metadata', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => response(searchPayload()))
      .mockImplementationOnce(() => response(lyricsPayload()))
      .mockImplementationOnce(() => response({message: {body: {}}}));

    const result = await checkLyricsSimilarity({
      lyrics: 'remember those walls i built\nsomething brand new',
      lineIds: ['line-a', 'line-b'],
    }, {MUSIXMATCH_API_KEY: 'key'}, fetchMock as typeof fetch);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(result).toMatchObject({
      ok: true,
      report: {
        risk: 'high',
        matches: [{
          candidateId: '123',
          title: 'Existing Song',
          artist: 'Known Writer',
          rhymeScore: 0.5,
          matchedEndWords: ['built'],
          matchedLineIds: ['line-a'],
          rhymeMatchedLineIds: ['line-a'],
        }],
      },
    });
    expect(result.ok && result.report.matches[0]?.longestOverlap)
      .toBe('remember those walls i built');
    expect(JSON.stringify(result)).not.toContain('tumbling down');
  });
});
