import {dialog, ipcMain, type BrowserWindow} from 'electron';
import type {OpenDialogOptions} from 'electron';
import * as path from 'node:path';

type StemExportTrack = {
  trackId?: string;
  name?: string;
};

type StemExportRequest = {
  title?: string;
  defaultPath?: string;
  tracks?: StemExportTrack[];
};

type StemExportIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
};

async function showOpenDialog(mainWindow: BrowserWindow | null, options: OpenDialogOptions) {
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

function sanitizeFileBaseName(name: string): string {
  return Array.from(name, char => {
    const code = char.charCodeAt(0);
    return code < 32 || '<>:"/\\|?*'.includes(char) ? '-' : char;
  }).join('');
}

function safeStemName(name: string, index: number): string {
  const cleaned = sanitizeFileBaseName(name)
    .replace(/\s+/g, ' ')
    .trim();
  const fallback = cleaned.length > 0 && cleaned !== '.' && cleaned !== '..'
    ? cleaned
    : `Track ${index + 1}`;
  return `${String(index + 1).padStart(2, '0')} ${fallback}.wav`;
}

export function registerStemExportIpc(config: StemExportIpcConfig): void {
  ipcMain.handle('project-file:export-stems', async (_event, request?: StemExportRequest) => {
    try {
      const tracks = Array.isArray(request?.tracks) ? request.tracks : [];
      if (tracks.length === 0 || tracks.some(track => typeof track.trackId !== 'string')) {
        return {ok: false, error: 'Stem export request is invalid.'};
      }

      const result = await showOpenDialog(config.getMainWindow(), {
        title: typeof request?.title === 'string' ? request.title : 'Export Stems',
        defaultPath: typeof request?.defaultPath === 'string' ? request.defaultPath : 'Stems',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return {ok: false, canceled: true, error: 'Stem export canceled.'};
      }

      const directoryPath = result.filePaths[0];
      return {
        ok: true,
        directoryPath,
        stems: tracks.map((track, index) => ({
          trackId: track.trackId,
          path: path.join(directoryPath, safeStemName(track.name ?? '', index)),
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not choose stem destination.';
      return {ok: false, error: message};
    }
  });
}
