import {
  getMusixmatchLyrics,
  parseMusixmatchDumpPayload,
  parseMusixmatchSearchPayload,
  parseMusixmatchSubtitlePayload,
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
    statusText: 'Provider error',
    json: () => Promise.resolve({}),
  } as Response);
}

const lyricsPayload = {
  message: {
    body: {
      lyrics: {
        lyrics_body: 'Oh, woah\nYou know you love me\nBaby, baby, baby, oh',
        lyrics_copyright: 'Lyrics copyright Musixmatch',
      },
    },
  },
};

describe('Musixmatch structural lyrics', () => {
  it('parses the has_track_structure search flag', () => {
    const tracks = parseMusixmatchSearchPayload({
      message: {body: {track_list: [{track: {
        track_id: 42,
        track_name: 'Baby',
        artist_name: 'Justin Bieber',
        commontrack_id: 123,
        track_isrc: 'USUM71012345',
        has_lyrics: 1,
        has_track_structure: 1,
      }}, {track: {
        track_id: 43,
        track_name: 'Baby Remix',
        has_lyrics: 1,
        has_track_structure: 0,
      }}]}},
    });

    expect(tracks[0]).toMatchObject({
      id: '42',
      title: 'Baby',
      isrc: 'USUM71012345',
      commontrackId: '123',
      hasLyrics: true,
      hasTrackStructure: true,
    });
    expect(tracks[1]).toMatchObject({id: '43', hasTrackStructure: false});
  });

  it('sanitizes catalog feed structure to known roles and line indexes only', () => {
    expect(parseMusixmatchDumpPayload({
      message: {body: [{
        structure: {
          intro: {lines: [0, 0, '1', -1, 2.4]},
          verse: {lines: [1, 3]},
          chorus: {lines: [4]},
          tempo: {bpm: 130},
        },
        unexpectedProviderField: 'hidden',
      }]},
    })).toEqual({
      intro: [0],
      verse: [1, 3],
      chorus: [4],
    });
  });

  it('parses line-timed Musixmatch LRC subtitle payloads', () => {
    expect(parseMusixmatchSubtitlePayload({
      message: {body: {subtitle: {
        subtitle_body: '[00:01.500]Oh, woah\n[00:03.000]You know you love me\n[00:05.25]Baby, baby, baby, oh',
      }}},
    })).toEqual([
      {text: 'Oh, woah', startSeconds: 1.5, endSeconds: 3},
      {text: 'You know you love me', startSeconds: 3, endSeconds: 5.25},
      {text: 'Baby, baby, baby, oh', startSeconds: 5.25},
    ]);
  });

  it('prefers catalog-feed track.dump.get when structure is flagged and ISRC is known', async () => {
    const fetchMock = jest.fn((url: URL) => {
      const href = String(url);
      if (href.includes('track.dump.get')) {
        return okJson({message: {body: [{structure: {
          intro: {lines: [0]},
          verse: {lines: [1]},
          chorus: {lines: [2]},
        }}]}});
      }
      return okJson(lyricsPayload);
    });

    await expect(getMusixmatchLyrics(
      {trackId: '42', trackIsrc: 'USUM71012345', hasTrackStructure: true},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      structure: {intro: [0], verse: [1], chorus: [2]},
      structureSource: 'catalog-feed',
    });
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('track.lyrics.get'),
      expect.stringContaining('track.dump.get'),
      expect.stringContaining('track.subtitle.get'),
    ]);
  });

  it('does not use semantic analysis as a structural fallback', async () => {
    const fetchMock = jest.fn((url: URL) => {
      const href = String(url);
      if (href.includes('track.dump.get')) {
        return okJson({message: {body: [{}]}});
      }
      return okJson(lyricsPayload);
    });

    await expect(getMusixmatchLyrics(
      {trackId: '42', trackIsrc: 'USUM71012345', hasTrackStructure: true},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      structureSource: 'unavailable',
      structureUnavailableReason: expect.any(String),
    });
    expect(fetchMock.mock.calls.map(call => String(call[0]).includes('track.lyrics.analysis.get'))).toEqual([false, false, false]);
  });

  it('returns synced subtitle timings when Musixmatch provides them', async () => {
    const fetchMock = jest.fn((url: URL) => {
      const href = String(url);
      if (href.includes('track.subtitle.get')) {
        return okJson({message: {body: {subtitle: {
          subtitle_body: '[00:01.000]Oh, woah\n[00:02.500]You know you love me',
        }}}});
      }
      return okJson(lyricsPayload);
    });

    await expect(getMusixmatchLyrics(
      {trackId: '42'},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      syncedLyricsSource: 'musixmatch-subtitle',
      syncedLyrics: [
        {text: 'Oh, woah', startSeconds: 1, endSeconds: 2.5},
        {text: 'You know you love me', startSeconds: 2.5},
      ],
    });
  });

  it('does not log lyric or structure payloads during lyric fetch', async () => {
    const infoSpy = jest.spyOn(console, 'info').mockImplementation(() => undefined);
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => okJson(lyricsPayload))
      .mockImplementationOnce(() => okJson({message: {body: [{structure: {
        intro: {lines: [0]},
        verse: {lines: [1]},
        chorus: {lines: [2]},
      }}]}}));

    try {
      await getMusixmatchLyrics(
        {trackId: '42', trackIsrc: 'USUM71012345', hasTrackStructure: true},
        {MUSIXMATCH_API_KEY: 'mxm'},
        fetchMock as typeof fetch,
      );

      expect(infoSpy).not.toHaveBeenCalled();
    } finally {
      infoSpy.mockRestore();
    }
  });

  it('skips the analysis endpoint when structure is not flagged', async () => {
    const fetchMock = jest.fn(() => okJson(lyricsPayload));

    await expect(getMusixmatchLyrics(
      {trackId: '42'},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toEqual({
      ok: true,
      trackId: '42',
      lyrics: 'Oh, woah\nYou know you love me\nBaby, baby, baby, oh',
      copyright: 'Lyrics copyright Musixmatch',
      structureSource: 'unavailable',
      structureUnavailableReason: 'selected track was not flagged with has_track_structure',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['401', () => failed(401)],
    ['404', () => failed(404)],
    ['missing structure', () => okJson({message: {body: [{}]}})],
  ])('keeps lyrics when catalog-feed structure is unavailable: %s', async (_label, structureResponse) => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => okJson(lyricsPayload))
      .mockImplementationOnce(structureResponse);

    await expect(getMusixmatchLyrics(
      {trackId: '42', trackIsrc: 'USUM71012345', hasTrackStructure: true},
      {MUSIXMATCH_API_KEY: 'mxm'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      trackId: '42',
      lyrics: 'Oh, woah\nYou know you love me\nBaby, baby, baby, oh',
      copyright: 'Lyrics copyright Musixmatch',
      structureSource: 'unavailable',
      structureUnavailableReason: expect.any(String),
    });
  });
});
