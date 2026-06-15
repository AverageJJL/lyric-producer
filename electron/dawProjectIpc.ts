import {dialog, ipcMain, type BrowserWindow} from 'electron';
import type {OpenDialogOptions, SaveDialogOptions} from 'electron';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {writeFileAtomic} from './atomicWrite';
import {writeMediaBytesIntoImports} from './mediaAssetFiles';

type DawProjectMediaFileRequest = {archivePath?: string; sourcePath?: string};
type DawProjectExportRequest = {
  projectXml?: string;
  metadataXml?: string;
  extensionJson?: string;
  defaultPath?: string;
  mediaFiles?: DawProjectMediaFileRequest[];
};
type DawProjectImportRequest = {path?: string};

type DawProjectIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
  assetRoots: () => {readRoot: string; writableRoot: string};
};

const dawProjectFileFilter = {name: 'DAWproject', extensions: ['dawproject']};
const audioEntryPattern = /^audio\/.+\.(wav|aif|aiff|flac|ogg|mp3|m4a)$/i;

function ensureDawProjectExtension(filePath: string): string {
  return path.extname(filePath).toLowerCase() === '.dawproject'
    ? filePath
    : `${filePath}.dawproject`;
}

function safeArchivePath(archivePath: string | undefined): string | null {
  const normalized = archivePath?.endsWith('/') ? archivePath.slice(0, -1) : archivePath;
  if (!normalized || path.isAbsolute(normalized) || normalized.includes('\\')) {
    return null;
  }
  const parts = normalized.split('/');
  return parts.some(part => part.length === 0 || part === '.' || part === '..')
    ? null
    : normalized;
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

async function exportArchive(
  request: DawProjectExportRequest | undefined,
  targetPath: string,
): Promise<{ok: true; path: string} | {ok: false; error: string}> {
  if (!request?.projectXml || !request.metadataXml) {
    return {ok: false, error: 'DAWproject export request is invalid.'};
  }
  const entries: Record<string, Uint8Array> = {
    'metadata.xml': strToU8(request.metadataXml),
    'project.xml': strToU8(request.projectXml),
  };
  if (request.extensionJson) {
    entries['extensions/ai-producer-core.json'] = strToU8(request.extensionJson);
  }
  for (const mediaFile of request.mediaFiles ?? []) {
    const archivePath = safeArchivePath(mediaFile.archivePath);
    if (!archivePath || !mediaFile.sourcePath) {
      return {ok: false, error: 'DAWproject media request is invalid.'};
    }
    const media = await fs.promises.readFile(mediaFile.sourcePath);
    entries[archivePath] = media;
  }
  const resolvedPath = ensureDawProjectExtension(targetPath);
  await writeFileAtomic(resolvedPath, zipSync(entries));
  return {ok: true, path: resolvedPath};
}

function unzipArchive(bytes: Uint8Array): Record<string, Uint8Array> | null {
  try {
    return unzipSync(bytes);
  } catch {
    return null;
  }
}

async function importArchive(config: DawProjectIpcConfig, filePath: string) {
  const entries = unzipArchive(await fs.promises.readFile(filePath));
  if (!entries) {
    return {ok: false, error: 'DAWproject ZIP could not be read.'};
  }
  const projectXmlBytes = entries['project.xml'];
  if (!projectXmlBytes) {
    return {ok: false, error: 'DAWproject is missing project.xml.'};
  }
  const mediaFiles = [];
  for (const [archivePath, data] of Object.entries(entries)) {
    const safePath = safeArchivePath(archivePath);
    if (!safePath) {
      return {ok: false, error: 'DAWproject contains an unsafe archive path.'};
    }
    if (!audioEntryPattern.test(safePath)) {
      continue;
    }
    mediaFiles.push(await writeMediaBytesIntoImports(config, path.basename(safePath), data));
    mediaFiles[mediaFiles.length - 1].archivePath = safePath;
  }
  return {
    ok: true,
    path: filePath,
    extensionJson: entries['extensions/ai-producer-core.json']
      ? strFromU8(entries['extensions/ai-producer-core.json'])
      : undefined,
    mediaFiles,
    metadataXml: entries['metadata.xml'] ? strFromU8(entries['metadata.xml']) : undefined,
    projectXml: strFromU8(projectXmlBytes),
  };
}

export function registerDawProjectIpc(config: DawProjectIpcConfig): void {
  ipcMain.handle('project-file:export-dawproject', async (_event, request?: DawProjectExportRequest) => {
    try {
      const result = await showSaveDialog(config.getMainWindow(), {
        title: 'Export DAWproject',
        defaultPath: request?.defaultPath ?? 'Arrangement.dawproject',
        filters: [dawProjectFileFilter],
      });
      if (result.canceled || !result.filePath) {
        return {ok: false, canceled: true, error: 'DAWproject export canceled.'};
      }
      return await exportArchive(request, result.filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not export DAWproject.';
      return {ok: false, error: message};
    }
  });

  ipcMain.handle('project-file:import-dawproject', async (_event, request?: DawProjectImportRequest) => {
    try {
      let filePath = request?.path;
      if (!filePath) {
        const result = await showOpenDialog(config.getMainWindow(), {
          title: 'Import DAWproject',
          properties: ['openFile'],
          filters: [dawProjectFileFilter],
        });
        if (result.canceled || result.filePaths.length === 0) {
          return {ok: false, canceled: true, error: 'DAWproject import canceled.'};
        }
        filePath = result.filePaths[0];
      }
      return await importArchive(config, filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import DAWproject.';
      return {ok: false, error: message};
    }
  });
}
