import {ipcMain} from 'electron';
import * as path from 'node:path';

import {analyzeSongSeed, type SongSeedAnalyzeRequest} from './songSeedAnalysis';
import {analyzeSongSeedReference} from './songSeedReference';
import {checkLyricsSimilarity} from './songSeedLyricsSimilarity';
import {
  getMusixmatchLyrics,
  lookupGetSongBpm,
  searchMusixmatchTracks,
  type SongSeedBpmKeyRequest,
  type SongSeedLyricsRequest,
  type SongSeedReferenceAnalyzeRequest,
  type SongSeedSearchRequest,
} from './songSeedProviders';

type AssetRoots = {
  readRoot: string;
  writableRoot: string;
};

type SongSeedIpcOptions = {
  appWideRoots?: () => AssetRoots;
};

function referenceCachePath(options: SongSeedIpcOptions): string | undefined {
  const root = options.appWideRoots?.().writableRoot;
  return root ? path.join(root, 'song-seed-reference-cache.json') : undefined;
}

function referenceSeedCachePath(options: SongSeedIpcOptions): string | undefined {
  const root = options.appWideRoots?.().readRoot;
  return root ? path.join(root, 'song-seed', 'reference-cache.seed.json') : undefined;
}

export function registerSongSeedIpc(options: SongSeedIpcOptions = {}): void {
  ipcMain.handle('song-seed:search', (_event, request: SongSeedSearchRequest) =>
    searchMusixmatchTracks(request),
  );
  ipcMain.handle('song-seed:get-lyrics', (_event, request: SongSeedLyricsRequest) =>
    getMusixmatchLyrics(request),
  );
  ipcMain.handle('song-seed:check-lyrics-similarity', (_event, request) =>
    checkLyricsSimilarity(request),
  );
  ipcMain.handle('song-seed:lookup-bpm-key', (_event, request: SongSeedBpmKeyRequest) =>
    lookupGetSongBpm(request),
  );
  ipcMain.handle('song-seed:analyze', (_event, request: SongSeedAnalyzeRequest) =>
    analyzeSongSeed(request),
  );
  ipcMain.handle('song-seed:analyze-reference', async (_event, request: SongSeedReferenceAnalyzeRequest) => {
    try {
      return analyzeSongSeedReference(request ?? {}, process.env, fetch, {
        cachePath: referenceCachePath(options),
        seedCachePath: referenceSeedCachePath(options),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not analyze the YouTube reference.';
      return {ok: false, code: 'network_error', error: message};
    }
  });
}
