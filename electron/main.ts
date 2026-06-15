import {app, BrowserWindow, crashReporter, ipcMain, Menu, screen, session} from 'electron';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {
  createAppMenuTemplate,
  projectCommandForPath,
  type AppProjectCommand,
} from './appMenu';
import {startCrashReporting} from './crashReporting';
import {registerDawProjectIpc} from './dawProjectIpc';
import {registerFileIpc} from './fileIpc';
import {registerMediaRevealIpc} from './mediaRevealIpc';
import {registerMidiImportIpc} from './midiImportIpc';
import {registerOfflineMediaRecoveryIpc} from './offlineMediaRecoveryIpc';
import {installPermissionPolicy} from './permissionPolicy';
import {installRuntimeUpdater} from './runtimeUpdater';
import {registerSampleLibraryIpc} from './sampleLibraryIpc';
import {registerSampleProviderIpc} from './sampleProviderIpc';
import {registerStemExportIpc} from './stemExportIpc';
import {registerFxWindowIpc} from './fxWindow';
import {
  attachProjectCloseGuard,
  registerProjectCloseGuardIpc,
  resetProjectCloseGuard,
} from './projectCloseGuard';
import {
  createNativeSurfaceWindowOptions,
  installNativeSurfaceWebContents,
} from './nativeSurfaceWindow';
import {runNativeIpcWithTrace} from './nativeIpcTrace';
import {
  DEFAULT_MAIN_WINDOW_BOUNDS,
  installMainWindowStatePersistence,
  readMainWindowBounds,
  workAreasFromDisplays,
} from './nativeWindowState';
import {focusExistingWindow, projectCommandFromArgv} from './singleInstance';

type NativeAudioAddon = {
  initEngine: (readRoot: string, writableRoot: string) => string;
  sendCommand: (command: string, payloadJson: string) => string;
  setEventCallback: (
    callback: (eventName: string, payloadJson: string) => void,
  ) => void;
  shutdownEngine: () => void;
};

let mainWindow: BrowserWindow | null = null;
let audioAddon: NativeAudioAddon | null = null;
let rendererLifecycleReady = false;
const pendingProjectCommands: AppProjectCommand[] = [];
const nativeRequire = createRequire(__filename);
const shouldRunApp = process.platform !== 'win32' || app.requestSingleInstanceLock();

startCrashReporting({app, crashReporter});

if (!shouldRunApp) {
  app.quit();
}

function resolveNativeAddon(): NativeAudioAddon {
  if (audioAddon) {
    return audioAddon;
  }

  const appRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'app.asar.unpacked')
    : app.getAppPath();
  const releaseAddonPath = path.join(
    appRoot,
    'electron',
    'native',
    'build-release',
    'Release',
    'native_audio_engine.node',
  );
  const legacyReleaseAddonPath = path.join(
    appRoot,
    'electron',
    'native',
    'build',
    'Release',
    'native_audio_engine.node',
  );
  const debugAddonPath = path.join(
    appRoot,
    'electron',
    'native',
    'build',
    'Debug',
    'native_audio_engine.node',
  );
  const addonPath = fs.existsSync(releaseAddonPath)
    ? releaseAddonPath
    : fs.existsSync(legacyReleaseAddonPath)
      ? legacyReleaseAddonPath
      : debugAddonPath;
  // Electron main is the only process allowed to load native engine code.
  audioAddon = nativeRequire(addonPath) as NativeAudioAddon;
  return audioAddon;
}

function assetRoots() {
  const readRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(app.getAppPath(), 'assets');
  const writableRoot = path.join(app.getPath('userData'), 'assets');

  fs.mkdirSync(path.join(writableRoot, 'recordings'), {recursive: true});
  fs.mkdirSync(path.join(writableRoot, 'spectrograms'), {recursive: true});
  fs.mkdirSync(path.join(writableRoot, 'imports'), {recursive: true});
  fs.mkdirSync(path.join(writableRoot, 'sample-library'), {recursive: true});
  return {readRoot, writableRoot};
}

function sendRendererEvent(eventName: string, payloadJson: string) {
  const webContents = mainWindow?.webContents;
  if (!webContents || webContents.isDestroyed()) {
    return;
  }

  webContents.send('audio-engine:event', eventName, payloadJson);
}

function flushPendingProjectCommands() {
  const webContents = mainWindow?.webContents;
  if (!rendererLifecycleReady || !webContents || webContents.isDestroyed()) {
    return;
  }
  while (pendingProjectCommands.length > 0) {
    webContents.send('app-lifecycle:project-command', pendingProjectCommands.shift());
  }
}

function sendProjectCommand(command: AppProjectCommand) {
  const webContents = mainWindow?.webContents;
  if (!rendererLifecycleReady || !webContents || webContents.isDestroyed()) {
    pendingProjectCommands.push(command);
    return;
  }
  webContents.send('app-lifecycle:project-command', command);
}

function handleRendererLoadError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Failed to load renderer: ${message}`);
  app.exit(1);
}

function initializeAudioEngine() {
  const addon = resolveNativeAddon();
  addon.setEventCallback((eventName, payloadJson) => {
    sendRendererEvent(eventName, payloadJson);
  });

  const {readRoot, writableRoot} = assetRoots();
  addon.initEngine(readRoot, writableRoot);
}

function createWindow() {
  rendererLifecycleReady = false;
  resetProjectCloseGuard();
  const restoredBounds = readMainWindowBounds(
    app.getPath('userData'),
    workAreasFromDisplays(screen.getAllDisplays()),
  );
  mainWindow = new BrowserWindow({
    ...DEFAULT_MAIN_WINDOW_BOUNDS,
    ...restoredBounds,
    minWidth: 1040,
    minHeight: 700,
    ...createNativeSurfaceWindowOptions(process.platform),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  installNativeSurfaceWebContents(mainWindow.webContents);
  installMainWindowStatePersistence(mainWindow, app.getPath('userData'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  attachProjectCloseGuard(mainWindow);

  mainWindow.on('closed', () => {
    mainWindow = null;
    rendererLifecycleReady = false;
    app.quit();
  });

  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    mainWindow.loadURL(devUrl).catch(handleRendererLoadError);
  } else {
    mainWindow
        .loadFile(path.join(app.getAppPath(), 'dist', 'renderer', 'index.html'))
        .catch(handleRendererLoadError);
  }
}

ipcMain.on('audio-engine:send-command', (event, command: string, payloadJson: string) => {
  try {
    const response = runNativeIpcWithTrace({
      command,
      payloadJson,
      isPackaged: app.isPackaged,
      invoke: () => resolveNativeAddon().sendCommand(command, payloadJson),
    });
    event.returnValue = response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown native bridge error';
    event.returnValue = JSON.stringify({ok: false, error: message});
  }
});

ipcMain.on('app-lifecycle:renderer-ready', () => {
  rendererLifecycleReady = true;
  flushPendingProjectCommands();
});

registerProjectCloseGuardIpc();

registerFileIpc({
  getMainWindow: () => mainWindow,
  assetRoots,
});
registerDawProjectIpc({
  getMainWindow: () => mainWindow,
  assetRoots,
});
registerMediaRevealIpc();
registerMidiImportIpc({getMainWindow: () => mainWindow});
registerOfflineMediaRecoveryIpc({
  getMainWindow: () => mainWindow,
  assetRoots,
});
registerSampleLibraryIpc({assetRoots});
registerSampleProviderIpc({assetRoots});
registerStemExportIpc({getMainWindow: () => mainWindow});
registerFxWindowIpc(() => mainWindow);

if (shouldRunApp) {
  app.on('second-instance', (_event, argv) => {
    if (!focusExistingWindow(mainWindow)) {
      createWindow();
    }
    const command = projectCommandFromArgv(argv);
    if (command) {
      sendProjectCommand(command);
    }
  });

  app.whenReady().then(() => {
    app.setName('AI Producer Core');
    installPermissionPolicy(session.defaultSession);
    Menu.setApplicationMenu(Menu.buildFromTemplate(
      createAppMenuTemplate(sendProjectCommand, process.platform),
    ));
    initializeAudioEngine();
    createWindow();
    installRuntimeUpdater({app, getMainWindow: () => mainWindow});

    app.on('activate', () => {
      if (!focusExistingWindow(mainWindow)) {
        createWindow();
      }
    });
  });
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  const command = projectCommandForPath(filePath);
  if (!command) {
    return;
  }
  sendProjectCommand(command);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('will-quit', () => {
  if (!audioAddon) {
    return;
  }

  // The renderer can cancel a close when the project is dirty. Waiting until
  // will-quit avoids tearing down the engine if that dialog keeps the app open.
  audioAddon.setEventCallback(() => undefined);
  audioAddon.shutdownEngine();
});
