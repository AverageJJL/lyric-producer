import {
  findYouTubeReference,
  parseYouTubeDurationSeconds,
  selectBestYouTubeReference,
} from '../electron/songSeedYouTube';

function response(payload: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(payload),
  } as Response);
}

function video(id: string, title: string, channelTitle: string, duration = 'PT3M42S') {
  return {id, snippet: {title, channelTitle}, contentDetails: {duration}};
}

const request = {
  title: 'Halo',
  artist: 'Beyonce',
};

describe('YouTube song seed reference lookup', () => {
  it('parses YouTube ISO durations', () => {
    expect(parseYouTubeDurationSeconds('PT3M42S')).toBe(222);
    expect(parseYouTubeDurationSeconds('PT1H2M3S')).toBe(3723);
    expect(parseYouTubeDurationSeconds(undefined)).toBeNull();
  });

  it('prefers official audio over cover uploads', () => {
    const best = selectBestYouTubeReference([
      video('cover', 'Halo - Beyonce cover', 'Bedroom Sessions'),
      video('official', 'Beyonce - Halo (Official Audio)', 'Beyonce - Topic'),
    ], request);

    expect(best).toMatchObject({
      videoId: 'official',
      channelTitle: 'Beyonce - Topic',
      confidence: expect.any(Number),
    });
  });

  it('recognizes artist VEVO channels as official candidates', () => {
    const best = selectBestYouTubeReference([
      video('vevo', 'Beyonce - Halo', 'BeyonceVEVO'),
    ], request);

    expect(best).toMatchObject({videoId: 'vevo', channelTitle: 'BeyonceVEVO'});
  });

  it('accepts official music videos when metadata says feat but YouTube says ft', () => {
    const best = selectBestYouTubeReference([
      video('baby', 'Justin Bieber - Baby ft. Ludacris (Official Music Video)', 'JustinBieberVEVO', 'PT3M45S'),
    ], {title: 'Baby feat. Ludacris', artist: 'Justin Bieber'});

    expect(best).toMatchObject({
      videoId: 'baby',
      confidence: expect.any(Number),
      matchReason: expect.stringContaining('official'),
    });
  });

  it('rejects videos over Cyanite YouTube duration limit', () => {
    const best = selectBestYouTubeReference([
      video('long', 'Beyonce - Halo (Official Audio)', 'Beyonce - Topic', 'PT11M1S'),
    ], request);

    expect(best).toBeNull();
  });

  it('rejects weak title and artist matches', () => {
    const best = selectBestYouTubeReference([
      video('weak', 'Someone Else - Unrelated Song', 'Random Uploads'),
    ], request);

    expect(best).toBeNull();
  });

  it('uses official YouTube API search and video details', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() => response({items: [
        {id: {videoId: 'cover'}, snippet: {title: 'Halo cover', channelTitle: 'Cover Channel'}},
        {id: {videoId: 'official'}, snippet: {title: 'Beyonce - Halo (Official Audio)', channelTitle: 'Beyonce - Topic'}},
      ]}))
      .mockImplementationOnce(() => response({items: [
        video('cover', 'Halo cover', 'Cover Channel'),
        video('official', 'Beyonce - Halo (Official Audio)', 'Beyonce - Topic'),
      ]}));

    await expect(findYouTubeReference(
      request,
      {YOUTUBE_API_KEY: 'youtube-key'},
      fetchMock as typeof fetch,
    )).resolves.toMatchObject({
      ok: true,
      source: expect.objectContaining({videoId: 'official'}),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('requires a YouTube API key', async () => {
    await expect(findYouTubeReference(
      request,
      {},
      jest.fn() as typeof fetch,
    )).resolves.toMatchObject({ok: false, code: 'missing_key'});
  });
});
