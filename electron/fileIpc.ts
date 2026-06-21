import {dialog, ipcMain, type BrowserWindow} from 'electron';
import type {OpenDialogOptions, SaveDialogOptions} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  copyMediaFileIntoImportsAsync,
  reserveRenderedAudioImportPath,
  resolveWritableAssetPath,
} from './mediaAssetFiles';

type ProjectFileMixdownRequest = {title?: string; defaultPath?: string};
type ProjectFileMidiWriteRequest = {path?: string; defaultPath?: string; base64?: string};
type MediaImportRequest = {path?: string};

type MediaResolveReference = {
  clipId?: string;
  relativePath?: string;
  absolutePath?: string;
};

type FileIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
  assetRoots: () => {readRoot: string; writableRoot: string};
};

const audioFileFilter = {
  name: 'Audio Files',
  extensions: ['wav', 'aif', 'aiff', 'flac', 'ogg', 'mp3', 'm4a'],
};
const mixdownFileFilter = {name: 'WAV Audio', extensions: ['wav']};
const midiFileFilter = {name: 'MIDI File', extensions: ['mid', 'midi']};

function ensureWavExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.wav' ? filePath : `${filePath}.wav`;
}

function ensureMidiExtension(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.mid' || ext === '.midi' ? filePath : `${filePath}.mid`;
}

function isProjectMediaRelativePath(relativePath: string): boolean {
  return relativePath.startsWith('imports/') || relativePath.startsWith('recordings/');
}

async function showSaveDialog(mainWindow: BrowserWindow | null, options: SaveDialogOptions) {
  return mainWindow
    ? dialog.showSaveDialog(mainWindow, options)
    : dialog.showSaveDialog(options);
}

async function showOpenDialog(mainWindow: BrowserWindow | null, options: OpenDialogOptions) {
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

async function copyAudioIntoProject(
  config: FileIpcConfig,
  request: MediaImportRequest | undefined,
  title: string,
  canceledError: string,
) {
  let sourcePath = request?.path;
  if (!sourcePath) {
    const result = await showOpenDialog(config.getMainWindow(), {
      title,
      properties: ['openFile'],
      filters: [audioFileFilter],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return {ok: false, canceled: true, error: canceledError};
    }
    sourcePath = result.filePaths[0];
  }

  return copyMediaFileIntoImportsAsync(config, sourcePath);
}

export function registerFileIpc(config: FileIpcConfig): void {
  // Project open/save now lives in apcProjectIpc.ts (folder-based `.apc` format).
  // This module retains only media + mixdown + MIDI file handlers.
  ipcMain.handle('media-file:import-audio', async (_event, request?: MediaImportRequest) => {
    try {
      return await copyAudioIntoProject(
        config,
        request,
        'Import Audio',
        'Audio import canceled.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import audio.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('media-file:relink-audio', async (_event, request?: MediaImportRequest) => {
    try {
      return await copyAudioIntoProject(
        config,
        request,
        'Relink Audio',
        'Audio relink canceled.',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not relink audio.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('media-file:duplicate-audio', async (_event, request?: MediaImportRequest) => {
    try {
      if (!request?.path) {
        return {ok: false, error: 'Audio source path is missing.'};
      }
      return await copyMediaFileIntoImportsAsync(config, request.path);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not duplicate audio media.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('media-file:prepare-audio-render', async (_event, request?: {defaultPath?: string}) => {
    try {
      return reserveRenderedAudioImportPath(config, request?.defaultPath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not prepare audio render.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('media-file:resolve-audio', async (_event, request?: {references?: MediaResolveReference[]}) => {
    try {
      const references = Array.isArray(request?.references) ? request.references : [];
      const resolved = await Promise.all(
        references.map(reference => resolveReference(config, reference)),
      );
      return {ok: true, resolved};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not resolve audio media.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('project-file:export-mixdown', async (_event, request?: ProjectFileMixdownRequest) => {
    try {
      const title = typeof request?.title === 'string' ? request.title : 'Export Mixdown';
      const defaultPath = typeof request?.defaultPath === 'string' ? request.defaultPath : 'Mixdown.wav';
      const result = await showSaveDialog(config.getMainWindow(), {
        title,
        defaultPath,
        filters: [mixdownFileFilter],
      });
      if (result.canceled || !result.filePath) {
        return {ok: false, canceled: true, error: 'Mixdown export canceled.'};
      }

      return {ok: true, path: ensureWavExtension(result.filePath)};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not choose mixdown destination.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('project-file:write-midi', async (_event, request?: ProjectFileMidiWriteRequest) => {
    try {
      if (!request?.base64 || typeof request.base64 !== 'string') {
        return {ok: false, error: 'MIDI export request is invalid.'};
      }
      let targetPath = request.path;
      if (!targetPath) {
        const result = await showSaveDialog(config.getMainWindow(), {
          title: 'Export MIDI',
          defaultPath: request.defaultPath ?? 'Arrangement.mid',
          filters: [midiFileFilter],
        });
        if (result.canceled || !result.filePath) {
          return {ok: false, canceled: true, error: 'MIDI export canceled.'};
        }
        targetPath = result.filePath;
      }

      const resolvedPath = ensureMidiExtension(targetPath);
      await fs.promises.writeFile(resolvedPath, Buffer.from(request.base64, 'base64'));
      return {ok: true, path: resolvedPath};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not export MIDI.';
      return {ok: false, error: message};
    }
  });
}

async function copyAbsoluteFallbackToRelativePath(
  sourcePath: string,
  targetPath: string,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), {recursive: true});
  await fs.promises.copyFile(sourcePath, targetPath);
}

async function resolveReference(config: FileIpcConfig, reference: MediaResolveReference) {
  const relativePath = typeof reference.relativePath === 'string' ? reference.relativePath : '';
  const relativeCandidate = relativePath
    ? resolveWritableAssetPath(config, relativePath)
    : null;
  if (relativeCandidate && fs.existsSync(relativeCandidate)) {
    return {
      clipId: reference.clipId ?? '',
      exists: true,
      absolutePath: relativeCandidate,
      relativePath,
      isProjectManaged: true,
      repaired: false,
    };
  }

  const absoluteCandidate = typeof reference.absolutePath === 'string'
    ? reference.absolutePath
    : '';
  if (absoluteCandidate && fs.existsSync(absoluteCandidate)) {
    if (
      relativeCandidate &&
      relativePath &&
      isProjectMediaRelativePath(relativePath)
    ) {
      await copyAbsoluteFallbackToRelativePath(absoluteCandidate, relativeCandidate);
      return {
        clipId: reference.clipId ?? '',
        exists: true,
        absolutePath: relativeCandidate,
        relativePath,
        isProjectManaged: true,
        repaired: true,
      };
    }

    const copied = await copyMediaFileIntoImportsAsync(config, absoluteCandidate);
    return {
      clipId: reference.clipId ?? '',
      exists: true,
      absolutePath: copied.absolutePath,
      relativePath: copied.relativePath,
      isProjectManaged: true,
      repaired: true,
    };
  }

  return {
    clipId: reference.clipId ?? '',
    exists: false,
    relativePath,
    absolutePath: absoluteCandidate || relativeCandidate || undefined,
    isProjectManaged: false,
    repaired: false,
  };
}
