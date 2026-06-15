import {ipcMain} from 'electron';
import {SampleLibraryManager} from './sampleLibraryManager';
import type {SampleLibraryRequest} from './sampleLibraryTypes';

type SampleLibraryIpcConfig = {
  assetRoots: () => {readRoot: string; writableRoot: string};
};

let manager: SampleLibraryManager | null = null;

export function registerSampleLibraryIpc(config: SampleLibraryIpcConfig): void {
  manager = new SampleLibraryManager({assetRoots: config.assetRoots});

  ipcMain.handle('sample-library:status', async () => manager?.status());
  ipcMain.handle('sample-library:download', async (_event, request?: SampleLibraryRequest) =>
    manager?.download(request));
  ipcMain.handle('sample-library:delete', async (_event, request?: SampleLibraryRequest) =>
    manager?.delete(request ?? {}));
  ipcMain.handle('sample-library:cancel', async (_event, request?: SampleLibraryRequest) =>
    manager?.cancel(request));
}
