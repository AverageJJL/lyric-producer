import type {App, BrowserWindow} from 'electron';
import {autoUpdater} from 'electron-updater';

export type RuntimeUpdateState =
  | 'disabled'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'download-progress'
  | 'downloaded'
  | 'error';

export type RuntimeUpdateStatus = {
  state: RuntimeUpdateState;
  message: string;
  version?: string;
  percent?: number;
  feedUrl?: string;
  channel?: string;
};

type AutoUpdaterLike = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string | null;
  logger: Pick<Console, 'info' | 'warn' | 'error'> | null;
  setFeedURL(options: {provider: 'generic'; url: string; channel: string}): void;
  checkForUpdatesAndNotify(): Promise<unknown>;
  on(eventName: string, listener: (...args: unknown[]) => void): AutoUpdaterLike;
};

export type RuntimeUpdaterInstallResult = {
  enabled: boolean;
  reason?: string;
  checkPromise?: Promise<unknown>;
};

export type RuntimeUpdaterDeps = {
  app: Pick<App, 'isPackaged' | 'getVersion'>;
  env?: NodeJS.ProcessEnv;
  updater?: AutoUpdaterLike;
  getMainWindow?: () => BrowserWindow | null;
  logger?: Pick<Console, 'info' | 'warn' | 'error'>;
};

const UPDATE_STATUS_CHANNEL = 'app-updates:status';

function configuredFeedUrl(env: NodeJS.ProcessEnv): string | null {
  const rawUrl = env.AI_PRODUCER_UPDATE_FEED_URL?.trim();
  if (!rawUrl) {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' ? parsed.toString().replace(/\/$/, '') : null;
  } catch {
    return null;
  }
}

function updateChannel(env: NodeJS.ProcessEnv): string {
  const rawChannel = env.AI_PRODUCER_UPDATE_CHANNEL?.trim();
  return rawChannel && /^[a-z0-9._-]+$/i.test(rawChannel) ? rawChannel : 'latest';
}

function shouldAutoDownload(env: NodeJS.ProcessEnv): boolean {
  return env.AI_PRODUCER_AUTO_DOWNLOAD_UPDATES !== '0';
}

function versionFromInfo(info: unknown): string | undefined {
  if (!info || typeof info !== 'object') {
    return undefined;
  }
  const version = (info as {version?: unknown}).version;
  return typeof version === 'string' ? version : undefined;
}

function percentFromInfo(info: unknown): number | undefined {
  if (!info || typeof info !== 'object') {
    return undefined;
  }
  const percent = (info as {percent?: unknown}).percent;
  return typeof percent === 'number' ? percent : undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendStatus(
  getMainWindow: (() => BrowserWindow | null) | undefined,
  status: RuntimeUpdateStatus,
): void {
  const webContents = getMainWindow?.()?.webContents;
  if (!webContents || webContents.isDestroyed()) {
    return;
  }
  webContents.send(UPDATE_STATUS_CHANNEL, status);
}

function attachUpdaterEvents(
  updater: AutoUpdaterLike,
  emit: (status: RuntimeUpdateStatus) => void,
): void {
  updater
      .on('checking-for-update', () => emit({
        state: 'checking',
        message: 'Checking for updates.',
      }))
      .on('update-available', info => emit({
        state: 'available',
        message: 'Update available.',
        version: versionFromInfo(info),
      }))
      .on('update-not-available', info => emit({
        state: 'not-available',
        message: 'No update available.',
        version: versionFromInfo(info),
      }))
      .on('download-progress', info => emit({
        state: 'download-progress',
        message: 'Downloading update.',
        percent: percentFromInfo(info),
      }))
      .on('update-downloaded', info => emit({
        state: 'downloaded',
        message: 'Update downloaded and ready to install on quit.',
        version: versionFromInfo(info),
      }))
      .on('error', error => emit({
        state: 'error',
        message: errorMessage(error),
      }));
}

export function installRuntimeUpdater(
  deps: RuntimeUpdaterDeps,
): RuntimeUpdaterInstallResult {
  const env = deps.env ?? process.env;
  const logger = deps.logger ?? console;
  const feedUrl = configuredFeedUrl(env);
  const channel = updateChannel(env);
  const updater = deps.updater ?? autoUpdater;
  const emit = (status: RuntimeUpdateStatus) => {
    const nextStatus: RuntimeUpdateStatus = {...status, channel};
    if (feedUrl) {
      nextStatus.feedUrl = feedUrl;
    }
    logger.info(`[updates] ${status.state}: ${status.message}`);
    sendStatus(deps.getMainWindow, nextStatus);
  };

  if (!deps.app.isPackaged) {
    const reason = 'Runtime updater disabled outside packaged builds.';
    emit({state: 'disabled', message: reason});
    return {enabled: false, reason};
  }
  if (!feedUrl) {
    const reason = 'Runtime updater disabled until AI_PRODUCER_UPDATE_FEED_URL is set to HTTPS.';
    emit({state: 'disabled', message: reason});
    return {enabled: false, reason};
  }

  updater.logger = logger;
  updater.channel = channel;
  updater.autoDownload = shouldAutoDownload(env);
  updater.autoInstallOnAppQuit = updater.autoDownload;
  updater.setFeedURL({provider: 'generic', url: feedUrl, channel});
  attachUpdaterEvents(updater, emit);

  const checkPromise = updater.checkForUpdatesAndNotify()
      .catch(error => {
        emit({state: 'error', message: errorMessage(error)});
      });

  return {enabled: true, checkPromise};
}

export const runtimeUpdateStatusChannel = UPDATE_STATUS_CHANNEL;
