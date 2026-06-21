import {
  clearSongSeedArtworkCache,
  enrichSongSeedArtwork,
  musixmatchAlbumCoverUrlFromRecord,
  parseItunesArtworkPayload,
} from '../electron/songSeedProviders';
import type {SongSeedTrack} from '../electron/songSeedTypes';

function okJson(payload: unknown) {
  return Promise.resolve({ok: true, json: () => Promise.resolve(payload)} as Response);
}

function track(input: Partial<SongSeedTrack> = {}): SongSeedTrack {
  return {
    id: input.id ?? 'mxm-1',
    title: input.title ?? 'Baby',
    artist: input.artist ?? 'Justin Bieber feat. Ludacris',
    album: input.album ?? 'My Worlds (International Version)',
    albumId: input.albumId,
    hasLyrics: true,
    source: 'musixmatch',
  };
}

const strongItunesPayload = {
  results: [{
    trackName: 'Baby (feat. Ludacris)',
    artistName: 'Justin Bieber',
    collectionName: 'My World 2.0 (Bonus Track Version)',
    artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/baby/100x100bb.jpg',
  }],
};

describe('song seed artwork enrichment', () => {
  beforeEach(() => clearSongSeedArtworkCache());

  it('ignores Musixmatch nocover placeholders', () => {
    expect(musixmatchAlbumCoverUrlFromRecord({
      album_coverart_100x100: 'http://s.mxmcdn.net/images-storage/albums/nocover.png',
    })).toBeUndefined();
  });

  it('selects strong iTunes artwork matches', () => {
    expect(parseItunesArtworkPayload(strongItunesPayload, track())).toBe(
      'https://is1-ssl.mzstatic.com/image/thumb/baby/100x100bb.jpg',
    );
  });

  it('rejects weak iTunes artwork matches', () => {
    expect(parseItunesArtworkPayload({
      results: [{
        trackName: 'Baby',
        artistName: 'Another Band',
        collectionName: 'Not The Album',
        artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/wrong/100x100bb.jpg',
      }],
    }, track())).toBeUndefined();
  });

  it('falls back to iTunes when Musixmatch has no real cover', async () => {
    const fetchMock = jest.fn((_url: URL) => okJson(strongItunesPayload));

    await expect(enrichSongSeedArtwork(
      [track({albumId: '20907043'})],
      {},
      fetchMock as typeof fetch,
      'baby',
    )).resolves.toEqual([expect.objectContaining({
      albumCoverUrl: 'https://is1-ssl.mzstatic.com/image/thumb/baby/100x100bb.jpg',
      artworkSource: 'itunes',
    })]);
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      expect.stringContaining('itunes.apple.com/search'),
    ]);
  });

  it('reuses cached iTunes artwork for duplicate metadata keys', async () => {
    const fetchMock = jest.fn(() => okJson(strongItunesPayload));
    const duplicate = track({id: 'mxm-2'});

    await expect(enrichSongSeedArtwork([track(), duplicate], {}, fetchMock as typeof fetch, 'baby'))
      .resolves.toEqual([
        expect.objectContaining({artworkSource: 'itunes'}),
        expect.objectContaining({artworkSource: 'itunes'}),
      ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('enriches multiple visible tracks with one query lookup', async () => {
    const fetchMock = jest.fn(() => okJson({
      results: [
        strongItunesPayload.results[0],
        {
          trackName: 'Dreams',
          artistName: 'Fleetwood Mac',
          collectionName: 'Rumours',
          artworkUrl100: 'https://is1-ssl.mzstatic.com/image/thumb/dreams/100x100bb.jpg',
        },
      ],
    }));

    await expect(enrichSongSeedArtwork([
      track(),
      track({id: 'mxm-3', title: 'Dreams', artist: 'Fleetwood Mac', album: 'Rumours'}),
    ], {}, fetchMock as typeof fetch, 'baby dreams')).resolves.toEqual([
      expect.objectContaining({albumCoverUrl: expect.stringContaining('/baby/')}),
      expect.objectContaining({albumCoverUrl: expect.stringContaining('/dreams/')}),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
