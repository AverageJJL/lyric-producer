import type {BrowserWindow} from 'electron';

import {registerApcProjectIpc} from './apcProjectIpc';
import {registerCopilotIpc} from './copilotIpc';
import {registerDawProjectIpc} from './dawProjectIpc';
import {registerFileIpc} from './fileIpc';
import {registerFxWindowIpc} from './fxWindow';
import {registerMediaRevealIpc} from './mediaRevealIpc';
import {registerMidiImportIpc} from './midiImportIpc';
import {registerOfflineMediaRecoveryIpc} from './offlineMediaRecoveryIpc';
import {registerProjectCloseGuardIpc} from './projectCloseGuard';
import {registerSampleLibraryIpc} from './sampleLibraryIpc';
import {registerSampleProviderIpc} from './sampleProviderIpc';
import {registerSongSeedIpc} from './songSeedIpc';
import {registerStemExportIpc} from './stemExportIpc';

type AssetRoots = {
  readRoot: string;
  writableRoot: string;
};

type MainIpcOptions = {
  getMainWindow: () => BrowserWindow | null;
  assetRoots: () => AssetRoots;
  appWideRoots: () => AssetRoots;
  recordActiveProjectFolder: (folderPath: string | null) => void;
  sendNativeCommand: (command: string, payloadJson: string) => string;
};

export function registerMainIpc(options: MainIpcOptions): void {
  registerProjectCloseGuardIpc();
  registerCopilotIpc({sendNativeCommand: options.sendNativeCommand});
  registerFileIpc({
    getMainWindow: options.getMainWindow,
    assetRoots: options.assetRoots,
  });
  registerApcProjectIpc({
    getMainWindow: options.getMainWindow,
    assetRoots: options.assetRoots,
    recordActiveProjectFolder: options.recordActiveProjectFolder,
    sendNativeCommand: options.sendNativeCommand,
  });
  registerDawProjectIpc({
    getMainWindow: options.getMainWindow,
    assetRoots: options.assetRoots,
  });
  registerMediaRevealIpc();
  registerMidiImportIpc({getMainWindow: options.getMainWindow});
  registerOfflineMediaRecoveryIpc({
    getMainWindow: options.getMainWindow,
    assetRoots: options.assetRoots,
  });
  registerSampleLibraryIpc({assetRoots: options.appWideRoots});
  registerSampleProviderIpc({assetRoots: options.appWideRoots});
  registerStemExportIpc({getMainWindow: options.getMainWindow});
  registerFxWindowIpc(options.getMainWindow);
  registerSongSeedIpc({appWideRoots: options.appWideRoots});
}
