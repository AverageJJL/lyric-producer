import * as fs from 'fs';
import * as path from 'path';

/**
 * Asset-root resolution, extracted from main.ts so it can be unit-tested without booting
 * Electron. There are TWO distinct writable roots, and conflating them is the bug this
 * split fixes:
 *
 *  - projectMediaRoots — recordings / imports / spectrograms for the OPEN project. Clips
 *    reference these by relative `audioFilePath`, so they belong INSIDE `Song.apc/assets`
 *    to keep a saved project self-contained. Falls back to the app-wide writable root
 *    while no project is open (unsaved / draft session).
 *
 *  - appWideAssetRoots — shared, non-project assets such as the sample library.
 *    These must NEVER move per-project (else opening a second project would show
 *    an empty sample library). Always under `userData`.
 *
 * Both share the same read-only bundled `readRoot`.
 */
export type AssetRootsResult = {readRoot: string; writableRoot: string};

export type AssetRootsEnv = {
  isPackaged: boolean;
  resourcesPath: string;
  appPath: string;
  userDataPath: string;
  activeProjectFolder: string | null;
  /** Injectable for tests; defaults to a recursive fs.mkdirSync. */
  ensureDir?: (dir: string) => void;
};

function readRootFor(env: AssetRootsEnv): string {
  return env.isPackaged
    ? path.join(env.resourcesPath, 'assets')
    : path.join(env.appPath, 'assets');
}

function ensure(env: AssetRootsEnv, dir: string): void {
  (env.ensureDir ?? ((target: string) => fs.mkdirSync(target, {recursive: true})))(dir);
}

/** The app-wide writable assets root (under userData) — shared by all projects. */
export function appWideWritableRoot(env: AssetRootsEnv): string {
  return path.join(env.userDataPath, 'assets');
}

/** Per-project media root: recordings/imports/spectrograms under the open Song.apc/assets. */
export function projectMediaRoots(env: AssetRootsEnv): AssetRootsResult {
  const readRoot = readRootFor(env);
  const writableRoot = env.activeProjectFolder
    ? path.join(env.activeProjectFolder, 'assets')
    : appWideWritableRoot(env);
  ensure(env, path.join(writableRoot, 'recordings'));
  ensure(env, path.join(writableRoot, 'spectrograms'));
  ensure(env, path.join(writableRoot, 'imports'));
  return {readRoot, writableRoot};
}

/** App-wide root for shared, non-project assets such as the sample library. */
export function appWideAssetRoots(env: AssetRootsEnv): AssetRootsResult {
  const readRoot = readRootFor(env);
  const writableRoot = appWideWritableRoot(env);
  ensure(env, path.join(writableRoot, 'sample-library'));
  return {readRoot, writableRoot};
}
