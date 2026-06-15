import {dialog, ipcMain, type BrowserWindow} from 'electron';
import type {OpenDialogOptions} from 'electron';
import * as path from 'node:path';

import {copyMediaFileIntoImports} from './mediaAssetFiles';
import {
  matchOfflineMediaSources,
  walkOfflineRecoveryAudioFiles,
  type OfflineMediaSourceRequest,
} from './offlineMediaRecoveryMatcher';

type OfflineMediaRecoveryRequest = {
  folderPath?: string;
  sources?: OfflineMediaSourceRequest[];
};

type OfflineMediaRecoveryIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
  assetRoots: () => {readRoot: string; writableRoot: string};
};

async function showOpenDialog(mainWindow: BrowserWindow | null, options: OpenDialogOptions) {
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

async function recoveryFolder(
  config: OfflineMediaRecoveryIpcConfig,
  request: OfflineMediaRecoveryRequest | undefined,
): Promise<string | null> {
  if (request?.folderPath) {
    return request.folderPath;
  }

  const result = await showOpenDialog(config.getMainWindow(), {
    title: 'Recover Offline Media',
    properties: ['openDirectory'],
  });
  return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]!;
}

function sourceKey(source: OfflineMediaSourceRequest): string {
  return source.sourceKey ?? source.sourcePath ?? source.name ?? '';
}

export function registerOfflineMediaRecoveryIpc(
  config: OfflineMediaRecoveryIpcConfig,
): void {
  ipcMain.handle('media-file:recover-offline-audio', async (
    _event,
    request?: OfflineMediaRecoveryRequest,
  ) => {
    try {
      const sources = Array.isArray(request?.sources) ? request.sources : [];
      if (sources.length === 0) {
        return {ok: false, error: 'No offline audio sources were provided.'};
      }

      const folderPath = await recoveryFolder(config, request);
      if (!folderPath) {
        return {ok: false, canceled: true, error: 'Offline media recovery canceled.'};
      }

      const candidates = walkOfflineRecoveryAudioFiles(folderPath);
      const matches = matchOfflineMediaSources(sources, candidates);
      const matchedKeys = new Set(matches.map(match => sourceKey(match.source)));
      const recovered = matches.map(match => {
        const copied = copyMediaFileIntoImports(config, match.absolutePath);
        return {
          sourceKey: sourceKey(match.source),
          sourcePath: match.source.sourcePath,
          matchedPath: match.absolutePath,
          originalPath: copied.originalPath,
          absolutePath: copied.absolutePath,
          relativePath: copied.relativePath,
          name: copied.name || path.parse(match.absolutePath).name,
        };
      });

      return {
        ok: true,
        folderPath,
        recovered,
        missing: sources
          .filter(source => !matchedKeys.has(sourceKey(source)))
          .map(source => ({
            sourceKey: sourceKey(source),
            sourcePath: source.sourcePath,
            name: source.name,
          })),
      };
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : 'Could not recover offline audio media.';
      return {ok: false, error: message};
    }
  });
}
