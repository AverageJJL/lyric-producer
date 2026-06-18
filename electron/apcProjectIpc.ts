import {dialog, ipcMain, type BrowserWindow} from 'electron';
import type {OpenDialogOptions, SaveDialogOptions} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {writeFileAtomic} from './atomicWrite';

/** Structural mirror of the renderer's ApcSourceFile (electron tsconfig can't import src/). */
type ApcSourceFile = {relativePath: string; content: string};

type ApcProjectIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
  assetRoots: () => {readRoot: string; writableRoot: string};
  /** Record which project folder is active (for asset re-homing / diagnostics). */
  recordActiveProjectFolder: (folderPath: string | null) => void;
  sendNativeCommand: (command: string, payloadJson: string) => string;
};

const APC_EXTENSION = '.apc';
const MANIFEST_FILE = 'manifest.json';
const TOP_FILES = [MANIFEST_FILE, 'project.json', 'timeline.json'];
const SOURCE_DIRS = ['tracks', 'clips', 'patterns', 'fx'];

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function ensureApcExtension(folderPath: string): string {
  return path.extname(folderPath).toLowerCase() === APC_EXTENSION
    ? folderPath
    : `${folderPath}${APC_EXTENSION}`;
}

/** A source relative path must stay inside the project folder (no traversal/absolute). */
function relativePathIsSafe(relativePath: string): boolean {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return false;
  }
  if (path.isAbsolute(relativePath)) {
    return false;
  }
  return !relativePath
    .split(/[\\/]/)
    .some(segment => segment === '..' || segment === '.' || segment.length === 0);
}

function showSaveDialog(mainWindow: BrowserWindow | null, options: SaveDialogOptions) {
  return mainWindow ? dialog.showSaveDialog(mainWindow, options) : dialog.showSaveDialog(options);
}

function showOpenDialog(mainWindow: BrowserWindow | null, options: OpenDialogOptions) {
  return mainWindow ? dialog.showOpenDialog(mainWindow, options) : dialog.showOpenDialog(options);
}

/**
 * Write the JSON source tree into the project folder.
 *
 * We write each file atomically IN PLACE (not via a whole-folder swap) precisely
 * because the folder also holds an `assets/` media subtree — a folder swap would
 * delete recordings/imports. Entity files no longer present in the tree are pruned
 * so deleted clips/tracks don't linger. manifest.json is written LAST as the
 * integrity anchor: a crash mid-write leaves a manifest that still matches the
 * previously-consistent file set.
 */
async function writeSourceTree(folderPath: string, files: ApcSourceFile[]): Promise<void> {
  await fs.promises.mkdir(folderPath, {recursive: true});
  const written = new Set<string>();
  const ordered = [
    ...files.filter(file => file.relativePath !== MANIFEST_FILE),
    ...files.filter(file => file.relativePath === MANIFEST_FILE),
  ];
  for (const file of ordered) {
    if (!relativePathIsSafe(file.relativePath)) {
      throw new Error(`Unsafe project file path: ${file.relativePath}`);
    }
    const absolute = path.join(folderPath, file.relativePath);
    await fs.promises.mkdir(path.dirname(absolute), {recursive: true});
    await writeFileAtomic(absolute, file.content, 'utf8');
    written.add(path.normalize(file.relativePath));
  }
  await pruneOrphans(folderPath, written);
}

async function pruneOrphans(folderPath: string, written: Set<string>): Promise<void> {
  for (const dir of SOURCE_DIRS) {
    const dirAbsolute = path.join(folderPath, dir);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dirAbsolute);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const relative = path.normalize(path.join(dir, entry));
      if (!written.has(relative)) {
        await fs.promises.rm(path.join(dirAbsolute, entry), {force: true});
      }
    }
  }
}

async function readSourceTree(folderPath: string): Promise<ApcSourceFile[]> {
  const files: ApcSourceFile[] = [];
  for (const top of TOP_FILES) {
    try {
      const content = await fs.promises.readFile(path.join(folderPath, top), 'utf8');
      files.push({relativePath: top, content});
    } catch {
      if (top === MANIFEST_FILE) {
        throw new Error('Not a valid .apc project (missing manifest.json).');
      }
    }
  }
  for (const dir of SOURCE_DIRS) {
    const dirAbsolute = path.join(folderPath, dir);
    let entries: string[];
    try {
      entries = await fs.promises.readdir(dirAbsolute);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.endsWith('.json')) {
        continue;
      }
      const content = await fs.promises.readFile(path.join(dirAbsolute, entry), 'utf8');
      files.push({relativePath: `${dir}/${entry}`, content});
    }
  }
  return files;
}

export function registerApcProjectIpc(config: ApcProjectIpcConfig): void {
  ipcMain.handle('apc-project:save-folder', async (_event, request: {folderPath?: string; files?: ApcSourceFile[]}) => {
    try {
      if (!request || !Array.isArray(request.files)) {
        return {ok: false, error: 'Project save request is invalid.'};
      }
      let folderPath = request.folderPath;
      if (!folderPath) {
        const result = await showSaveDialog(config.getMainWindow(), {
          title: 'Save Project',
          defaultPath: 'Untitled.apc',
        });
        if (result.canceled || !result.filePath) {
          return {ok: false, canceled: true, error: 'Project save canceled.'};
        }
        folderPath = result.filePath;
      }
      const resolvedPath = ensureApcExtension(folderPath);
      await writeSourceTree(resolvedPath, request.files);
      return {ok: true, path: resolvedPath};
    } catch (error) {
      return {ok: false, error: messageFrom(error, 'Could not save project.')};
    }
  });

  ipcMain.handle('apc-project:open-folder', async (_event, request?: {path?: string}) => {
    try {
      let folderPath = request?.path;
      if (!folderPath) {
        const result = await showOpenDialog(config.getMainWindow(), {
          title: 'Open Project',
          properties: ['openDirectory'],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return {ok: false, canceled: true, error: 'Project open canceled.'};
        }
        folderPath = result.filePaths[0];
      }
      const files = await readSourceTree(folderPath);
      return {ok: true, path: folderPath, files};
    } catch (error) {
      return {ok: false, error: messageFrom(error, 'Could not open project.')};
    }
  });

  ipcMain.handle('apc-project:set-active-root', async (_event, request?: {folderPath?: string | null}) => {
    try {
      const folderPath = request && typeof request.folderPath === 'string' ? request.folderPath : null;
      config.recordActiveProjectFolder(folderPath);
      // Re-issue the engine's asset root so native recordings/renders stay in sync
      // with the active project. (Per-project media re-homing under Song.apc/assets
      // builds on this call path and is finalized during runtime verification.)
      const {readRoot, writableRoot} = config.assetRoots();
      config.sendNativeCommand('set_asset_root', JSON.stringify({root: readRoot, writableRoot}));
      return {ok: true, writableRoot};
    } catch (error) {
      return {ok: false, error: messageFrom(error, 'Could not set project asset root.')};
    }
  });
}
