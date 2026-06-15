import {dialog, ipcMain, type BrowserWindow} from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';

type MidiImportRequest = {path?: string};

type MidiImportIpcConfig = {
  getMainWindow: () => BrowserWindow | null;
};

const midiFileFilter = {name: 'MIDI Files', extensions: ['mid', 'midi']};

async function showOpenDialog(mainWindow: BrowserWindow | null) {
  const options = {
    title: 'Import MIDI',
    properties: ['openFile'] as Array<'openFile'>,
    filters: [midiFileFilter],
  };
  return mainWindow
    ? dialog.showOpenDialog(mainWindow, options)
    : dialog.showOpenDialog(options);
}

export function registerMidiImportIpc(config: MidiImportIpcConfig): void {
  ipcMain.handle('media-file:import-midi', async (_event, request?: MidiImportRequest) => {
    try {
      let sourcePath = request?.path;
      if (!sourcePath) {
        const result = await showOpenDialog(config.getMainWindow());
        if (result.canceled || result.filePaths.length === 0) {
          return {ok: false, canceled: true, error: 'MIDI import canceled.'};
        }
        sourcePath = result.filePaths[0];
      }

      return {
        ok: true,
        originalPath: sourcePath,
        base64: fs.readFileSync(sourcePath).toString('base64'),
        name: path.parse(sourcePath).name || 'Imported MIDI',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not import MIDI.';
      return {ok: false, error: message};
    }
  });
}
