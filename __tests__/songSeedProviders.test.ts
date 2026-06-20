import {
  getMusixmatchLyrics,
  lookupGetSongBpm,
  parseGetSongBpmPayload,
  parseMusixmatchSearchPayload,
  searchMusixmatchTracks,
} from '../electron/songSeedProviders';

function okJson(payload: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(payload),
  } as Response);
}

function failed(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: 'Unauthorized',
    json: () => Promise.resolve({}),
  } as Response);
}

describe('song seed providers', () => {
  it('normalizes Musixmatch track search results', () => {
    const tracks = parseMusixmatchSearchPayload({
      message: {
        body: {
          track_list: [{
            track: {
              track_id: 42,
              track_name: 'Dreams',
              artist_name: 'Fleetwood Mac',
              album_name: 'Rumours',
              first_release_date: '1977-02-04',
              has_lyrics: 1,
            },
          }],
        },
      },
    });

    expect(tracks).toEqual([{
      id: '42',
      title: 'Dreams',
      artist: 'Fleetwood Mac',
      album: 'Rumours',
      releaseYear: '1977',
      hasLyrics: true,
      source: 'musixmatch',
    }]);
  });

  it('requires a Musixmatch key before searching', async () => {
    await expect(searchMusixmatchTracks({query: 'dreams'}, {}, jest.fn())).resolves.toEqual({
      ok: false,
      code: 'missing_key',
      error: 'MUSIXMATCH_API_KEY is not set.',
    });
  });

  it('fetches Musixmatch lyrics for a selected track', async () => {
    const fetchMock = jest.fn(() => okJson({
      message: {
        body: {
          lyrics: {
            lyrics_body: 'Line one\nLine two',
            lyrics_copyright: 'Lyrics copyright Musixmatch',
          },
        },
      },
    }));

    await expect(getMusixmatchLyrics(
      {trackId: '42'},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      trackId: '42',
      lyrics: 'Line one\nLine two',
      copyright: 'Lyrics copyright Musixmatch',
    });
  });

  it('keeps GetSongBPM optional when tempo and key are missing on a confident match', () => {
    expect(parseGetSongBpmPayload({
      search: [{title: 'Unknown Song', artist: {name: 'Unknown Artist'}}],
    }, 'Unknown Song', {title: 'Unknown Song', artist: 'Unknown Artist'})).toMatchObject({
      ok: true,
      title: 'Unknown Song',
      artist: 'Unknown Artist',
      bpm: undefined,
      key: undefined,
      source: 'getsongbpm',
      confidence: expect.any(Number),
    });
  });

  it('prefers public Blank Space metadata over a bad GetSongBPM candidate', () => {
    expect(parseGetSongBpmPayload({
      search: [{title: 'Blank Space', artist: {name: 'Taylor Swift'}, tempo: 137, key_of: 'F# major'}],
    }, 'Blank Space', {title: 'Blank Space', artist: 'Taylor Swift'}, {
      title: 'Blank Space',
      artist: 'Taylor Swift',
      bpm: 96,
      key: 'F major',
      confidence: 0.96,
      note: 'Public context override',
      productionContext: 'Minimal electropop production.',
    })).toMatchObject({
      ok: true,
      bpm: 96,
      key: 'F major',
      source: 'public-context',
    });
  });

  it('reports GetSongBPM missing key without calling the network', async () => {
    const fetchMock = jest.fn();
    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'missing_key'});
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports GetSongBPM authorization failures without public context', async () => {
    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'bad-key'},
      jest.fn(() => failed(401)) as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'unauthorized'});
  });

  it('falls back when GetSongBPM times out', async () => {
    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'slow-key', GETSONGBPM_TIMEOUT_MS: '5'},
      jest.fn(() => new Promise<Response>(() => undefined)) as typeof fetch,
    )).resolves.toMatchObject({
      ok: false,
      code: 'network_error',
      error: 'GetSongBPM timed out.',
    });
  });

  it('uses OpenRouter web metadata after a GetSongBPM authorization failure', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => failed(401))
      .mockImplementationOnce(() => okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Dreams',
              artist: 'Fleetwood Mac',
              bpm: 120,
              key: 'A minor',
              confidence: 0.86,
              sources: [{title: 'Tempo source', url: 'https://example.com/dreams-tempo'}],
            }),
          },
        }],
      }));

    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'bad-key', OPENROUTER_API_KEY: 'openrouter'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      bpm: 120,
      key: 'A minor',
      source: 'openrouter-web',
      candidates: [expect.objectContaining({
        source: 'openrouter-web',
        sources: [{title: 'Tempo source', url: 'https://example.com/dreams-tempo'}],
      })],
    });

    const [, openRouterCall] = fetchMock.mock.calls;
    expect(openRouterCall[0]).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.parse(openRouterCall[1].body)).toMatchObject({
      plugins: [{id: 'web', max_results: 4}],
    });
  });

  it('uses OpenRouter web metadata when GetSongBPM has only weak matches', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => okJson({
        search: [{
          title: 'Dreams Live Rehearsal',
          artist: {name: 'Another Band'},
          tempo: 137,
          key_of: 'F# major',
        }],
      }))
      .mockImplementationOnce(() => okJson({
        choices: [{
          message: {
            content: JSON.stringify({
              title: 'Dreams',
              artist: 'Fleetwood Mac',
              bpm: 120,
              key: 'A minor',
              confidence: 0.8,
              sources: [{url: 'https://example.com/dreams-key'}],
            }),
          },
        }],
      }));

    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'ok-key', OPENROUTER_API_KEY: 'openrouter'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      bpm: 120,
      key: 'A minor',
      source: 'openrouter-web',
    });
  });

  it('keeps the original metadata error when OpenRouter web validation fails', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => failed(401))
      .mockImplementationOnce(() => okJson({
        choices: [{message: {content: '{"bpm":300,"key":"H major","confidence":0.99,"sources":[]}'}}],
      }));

    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'bad-key', OPENROUTER_API_KEY: 'openrouter'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'unauthorized'});
  });

  it('keeps the original metadata error when OpenRouter web times out', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => failed(401))
      .mockImplementationOnce(() => new Promise<Response>(() => undefined));

    await expect(lookupGetSongBpm(
      {title: 'Dreams', artist: 'Fleetwood Mac'},
      {GETSONGBPM_API_KEY: 'bad-key', OPENROUTER_API_KEY: 'openrouter', OPENROUTER_WEB_TIMEOUT_MS: '5'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'unauthorized'});
  });
});
