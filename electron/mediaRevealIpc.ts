import {ipcMain, shell} from 'electron';
import * as fs from 'node:fs';

type MediaRevealRequest = {path?: string};

export function registerMediaRevealIpc(): void {
  ipcMain.handle('media-file:reveal-audio', async (_event, request?: MediaRevealRequest) => {
    try {
      const filePath = request?.path;
      if (!filePath) {
        return {ok: false, error: 'Audio media path is missing.'};
      }
      if (!fs.existsSync(filePath)) {
        return {ok: false, error: 'Audio media file could not be found.'};
      }
      shell.showItemInFolder(filePath);
      return {ok: true};
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not reveal audio media.';
      return {ok: false, error: message};
    }
  });
}
