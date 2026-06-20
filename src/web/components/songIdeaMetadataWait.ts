import type {SongSeedBpmKeyResponse} from '../../native/songSeedApi';

export const SONG_METADATA_WAIT_MS = 1800;

export function waitForSongMetadata(
  promise: Promise<SongSeedBpmKeyResponse | null>,
  timeoutMs = SONG_METADATA_WAIT_MS,
): Promise<SongSeedBpmKeyResponse | null> {
  return new Promise(resolve => {
    const timer = window.setTimeout(() => resolve(null), timeoutMs);
    void promise
      .then(value => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch(() => {
        window.clearTimeout(timer);
        resolve(null);
      });
  });
}
