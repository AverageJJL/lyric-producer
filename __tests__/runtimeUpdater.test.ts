jest.mock('electron-updater', () => ({
  autoUpdater: {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    channel: null,
    logger: null,
    setFeedURL: jest.fn(),
    checkForUpdatesAndNotify: jest.fn(),
    on: jest.fn().mockReturnThis(),
  },
}));

import {
  installRuntimeUpdater,
  runtimeUpdateStatusChannel,
} from '../electron/runtimeUpdater';

type MockUpdater = {
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  channel: string | null;
  logger: unknown;
  setFeedURL: jest.Mock;
  checkForUpdatesAndNotify: jest.Mock;
  on: jest.Mock;
  emit: (eventName: string, payload?: unknown) => void;
};

function createUpdater(checkResult: Promise<unknown> = Promise.resolve(null)): MockUpdater {
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const updater: MockUpdater = {
    autoDownload: false,
    autoInstallOnAppQuit: false,
    channel: null,
    logger: null,
    setFeedURL: jest.fn(),
    checkForUpdatesAndNotify: jest.fn(() => checkResult),
    on: jest.fn((eventName: string, listener: (...args: unknown[]) => void) => {
      listeners.set(eventName, listener);
      return updater;
    }),
    emit: (eventName: string, payload?: unknown) => {
      listeners.get(eventName)?.(payload);
    },
  };
  return updater;
}

function app(isPackaged: boolean) {
  return {
    isPackaged,
    getVersion: () => '0.0.1',
  };
}

function windowSink(sent: unknown[]) {
  return {
    webContents: {
      isDestroyed: () => false,
      send: (channel: string, payload: unknown) => sent.push({channel, payload}),
    },
  };
}

function logger() {
  return {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  };
}

describe('runtime updater', () => {
  it('stays disabled outside packaged builds', () => {
    const updater = createUpdater();
    const sent: unknown[] = [];

    const result = installRuntimeUpdater({
      app: app(false),
      env: {AI_PRODUCER_UPDATE_FEED_URL: 'https://updates.example.com'},
      updater,
      getMainWindow: () => windowSink(sent) as never,
      logger: logger(),
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('outside packaged builds');
    expect(updater.checkForUpdatesAndNotify).not.toHaveBeenCalled();
    expect(sent).toEqual([{
      channel: runtimeUpdateStatusChannel,
      payload: expect.objectContaining({state: 'disabled', channel: 'latest'}),
    }]);
  });

  it('requires an HTTPS update feed in packaged builds', () => {
    const updater = createUpdater();

    const result = installRuntimeUpdater({
      app: app(true),
      env: {AI_PRODUCER_UPDATE_FEED_URL: 'http://updates.example.com'},
      updater,
      logger: logger(),
    });

    expect(result.enabled).toBe(false);
    expect(result.reason).toContain('AI_PRODUCER_UPDATE_FEED_URL');
    expect(updater.setFeedURL).not.toHaveBeenCalled();
  });

  it('configures the generic runtime feed and forwards updater events', async () => {
    const updater = createUpdater();
    const sent: unknown[] = [];

    const result = installRuntimeUpdater({
      app: app(true),
      env: {
        AI_PRODUCER_UPDATE_FEED_URL: 'https://updates.example.com/latest/',
        AI_PRODUCER_UPDATE_CHANNEL: 'beta',
        AI_PRODUCER_AUTO_DOWNLOAD_UPDATES: '0',
      },
      updater,
      getMainWindow: () => windowSink(sent) as never,
      logger: logger(),
    });

    expect(result.enabled).toBe(true);
    expect(updater.setFeedURL).toHaveBeenCalledWith({
      provider: 'generic',
      url: 'https://updates.example.com/latest',
      channel: 'beta',
    });
    expect(updater.channel).toBe('beta');
    expect(updater.autoDownload).toBe(false);
    expect(updater.autoInstallOnAppQuit).toBe(false);
    expect(updater.checkForUpdatesAndNotify).toHaveBeenCalledTimes(1);

    updater.emit('update-available', {version: '0.0.2'});
    updater.emit('download-progress', {percent: 42});
    updater.emit('update-downloaded', {version: '0.0.2'});
    await result.checkPromise;

    expect(sent).toEqual(expect.arrayContaining([
      {
        channel: runtimeUpdateStatusChannel,
        payload: expect.objectContaining({state: 'available', version: '0.0.2'}),
      },
      {
        channel: runtimeUpdateStatusChannel,
        payload: expect.objectContaining({state: 'download-progress', percent: 42}),
      },
      {
        channel: runtimeUpdateStatusChannel,
        payload: expect.objectContaining({state: 'downloaded', version: '0.0.2'}),
      },
    ]));
  });

  it('reports check failures without crashing startup', async () => {
    const updater = createUpdater(Promise.reject(new Error('feed unreachable')));
    const sent: unknown[] = [];

    const result = installRuntimeUpdater({
      app: app(true),
      env: {AI_PRODUCER_UPDATE_FEED_URL: 'https://updates.example.com'},
      updater,
      getMainWindow: () => windowSink(sent) as never,
      logger: logger(),
    });

    await result.checkPromise;

    expect(sent).toEqual(expect.arrayContaining([
      {
        channel: runtimeUpdateStatusChannel,
        payload: expect.objectContaining({state: 'error', message: 'feed unreachable'}),
      },
    ]));
  });
});
