import {app, BrowserWindow, ipcMain} from 'electron';
import * as path from 'node:path';
import {installNativeSurfaceWebContents} from './nativeSurfaceWindow';

type FxWindowSyncPayload = {
  targetTrackId: string | null;
  selectedTrackId: string | null;
  tracks: Array<{id: string; name: string; type: string; instrumentId?: string; presetId?: string; automationMode?: string}>;
};

let fxWindow: BrowserWindow | null = null;
let fxTargetTrackId: string | null = null;
let latestSync: FxWindowSyncPayload = {
  targetTrackId: null,
  selectedTrackId: null,
  tracks: [],
};

function fxWindowUrl(): string {
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl) {
    return `${devUrl.replace(/\/$/, '')}/fx.html`;
  }
  return '';
}

function fxWindowFile(): string {
  return path.join(app.getAppPath(), 'dist', 'renderer', 'fx.html');
}

function sendFxState() {
  if (!fxWindow || fxWindow.isDestroyed()) {
    return;
  }
  const payload: FxWindowSyncPayload = {
    ...latestSync,
    targetTrackId: fxTargetTrackId ?? latestSync.targetTrackId ?? latestSync.selectedTrackId,
  };
  fxWindow.webContents.send('fx-window:state', payload);
}

function notifyMainSummaryRefresh(getMainWindow: () => BrowserWindow | null) {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) {
    return;
  }
  main.webContents.send('fx-summary:refresh');
}

export function openOrFocusFxWindow(
  getMainWindow: () => BrowserWindow | null,
  trackId: string,
) {
  fxTargetTrackId = trackId;
  if (fxWindow && !fxWindow.isDestroyed()) {
    fxWindow.focus();
    sendFxState();
    return;
  }

  const parent = getMainWindow() ?? undefined;
  fxWindow = new BrowserWindow({
    width: 520,
    height: 720,
    minWidth: 400,
    minHeight: 480,
    parent,
    backgroundColor: '#15171d',
    title: 'Track FX',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  installNativeSurfaceWebContents(fxWindow.webContents);

  fxWindow.once('ready-to-show', () => {
    fxWindow?.show();
  });

  fxWindow.on('closed', () => {
    fxWindow = null;
  });

  const devUrl = fxWindowUrl();
  if (devUrl) {
    fxWindow.loadURL(devUrl).catch(error => {
      console.error(`Failed to load FX window: ${error}`);
    });
  } else {
    fxWindow.loadFile(fxWindowFile()).catch(error => {
      console.error(`Failed to load FX window: ${error}`);
    });
  }

  fxWindow.webContents.once('did-finish-load', () => {
    sendFxState();
  });
}

export function registerFxWindowIpc(getMainWindow: () => BrowserWindow | null) {
  ipcMain.on('fx-window:open', (_event, trackId: string) => {
    if (typeof trackId !== 'string' || trackId.length === 0) {
      return;
    }
    openOrFocusFxWindow(getMainWindow, trackId);
  });

  ipcMain.on('fx-window:sync', (_event, payload: FxWindowSyncPayload) => {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    latestSync = payload;
    sendFxState();
  });

  ipcMain.on('fx-window:changed', () => {
    notifyMainSummaryRefresh(getMainWindow);
    sendFxState();
  });
}
