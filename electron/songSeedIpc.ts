import {ipcMain} from 'electron';
import * as path from 'node:path';

import {analyzeSongSeed, type SongSeedAnalyzeRequest} from './songSeedAnalysis';
import {
  getDemoSongSeedLyrics,
  lookupDemoSongSeedBpmKey,
  searchDemoSongSeedTracks,
} from './demoSongSeed';
import {analyzeSongSeedReference} from './songSeedReference';
import {checkLyricsSimilarity} from './songSeedLyricsSimilarity';
import {
  readPublicDemoConfig,
  songSeedEnvForPublicDemo,
  type PublicDemoConfig,
} from './publicDemoConfig';
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
  demoConfig?: () => PublicDemoConfig;
};

function referenceCachePath(options: SongSeedIpcOptions): string | undefined {
  const root = options.appWideRoots?.().writableRoot;
  return root ? path.join(root, 'song-seed-reference-cache.json') : undefined;
}

function referenceSeedCachePath(options: SongSeedIpcOptions): string | undefined {
  const root = options.appWideRoots?.().readRoot;
  return root ? path.join(root, 'song-seed', 'reference-cache.seed.json') : undefined;
}

function demoSongSeedPath(options: SongSeedIpcOptions): string | undefined {
  const root = options.appWideRoots?.().readRoot;
  return root ? path.join(root, 'song-seed', 'demo-song-seeds.json') : undefined;
}

function demoConfig(options: SongSeedIpcOptions): PublicDemoConfig {
  return options.demoConfig?.()
    ?? readPublicDemoConfig(options.appWideRoots?.().readRoot, process.env);
}

function unavailableSimilarity() {
  return {
    ok: true as const,
    report: {
      checkedAt: new Date().toISOString(),
      risk: 'unavailable' as const,
      matches: [],
      note: 'Live Musixmatch similarity checks are disabled in the public demo build.',
    },
  };
}

export function registerSongSeedIpc(options: SongSeedIpcOptions = {}): void {
  ipcMain.handle('song-seed:search', (_event, request: SongSeedSearchRequest) => {
    const config = demoConfig(options);
    return config.enabled && config.disableLiveSongSeedProviders
      ? searchDemoSongSeedTracks(request, demoSongSeedPath(options))
      : searchMusixmatchTracks(request);
  });
  ipcMain.handle('song-seed:get-lyrics', (_event, request: SongSeedLyricsRequest) => {
    const config = demoConfig(options);
    return config.enabled && config.disableLiveSongSeedProviders
      ? getDemoSongSeedLyrics(request, demoSongSeedPath(options))
      : getMusixmatchLyrics(request);
  });
  ipcMain.handle('song-seed:check-lyrics-similarity', (_event, request) => {
    const config = demoConfig(options);
    return config.enabled && config.disableLiveSongSeedProviders
      ? unavailableSimilarity()
      : checkLyricsSimilarity(request);
  });
  ipcMain.handle('song-seed:lookup-bpm-key', (_event, request: SongSeedBpmKeyRequest) => {
    const config = demoConfig(options);
    return config.enabled && config.disableLiveSongSeedProviders
      ? lookupDemoSongSeedBpmKey(request, demoSongSeedPath(options))
      : lookupGetSongBpm(request);
  });
  ipcMain.handle('song-seed:analyze', (_event, request: SongSeedAnalyzeRequest) => {
    const config = demoConfig(options);
    return analyzeSongSeed(request, songSeedEnvForPublicDemo(process.env, config));
  });
  ipcMain.handle('song-seed:analyze-reference', async (_event, request: SongSeedReferenceAnalyzeRequest) => {
    const config = demoConfig(options);
    try {
      return analyzeSongSeedReference(request ?? {}, process.env, fetch, {
        cachePath: referenceCachePath(options),
        seedCachePath: referenceSeedCachePath(options),
        demoMode: config.enabled && config.disableLiveCyanite,
        demoLimitMessage: config.cyaniteLimitMessage,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not analyze the YouTube reference.';
      return {ok: false, code: 'network_error', error: message};
    }
  });
}
