import {startCrashReporting} from '../electron/crashReporting';

function appMock(isPackaged = false) {
  return {
    getName: () => 'AI Producer Core',
    getVersion: () => '1.2.3',
    isPackaged,
  };
}

describe('Electron crash reporting', () => {
  it('collects crash dumps locally when no upload endpoint is configured', () => {
    const crashReporter = {start: jest.fn()};
    const status = startCrashReporting({
      app: appMock(),
      crashReporter,
      env: {},
      platform: 'darwin',
    });

    expect(status).toEqual({uploadToServer: false, releaseChannel: 'development'});
    expect(crashReporter.start).toHaveBeenCalledWith(expect.objectContaining({
      productName: 'AI Producer Core',
      uploadToServer: false,
      rateLimit: true,
      compress: true,
      globalExtra: expect.objectContaining({
        appVersion: '1.2.3',
        releaseChannel: 'development',
        platform: 'darwin',
        packaged: 'false',
      }),
      extra: {processRole: 'browser'},
    }));
    expect(crashReporter.start.mock.calls[0][0].submitURL).toBeUndefined();
  });

  it('uploads crash reports only when a valid endpoint is configured', () => {
    const crashReporter = {start: jest.fn()};
    const status = startCrashReporting({
      app: appMock(true),
      crashReporter,
      env: {
        AI_PRODUCER_CRASH_UPLOAD_URL: 'https://crashes.example.com/post',
        AI_PRODUCER_RELEASE_CHANNEL: 'beta',
      },
      platform: 'win32',
    });

    expect(status).toEqual({
      uploadToServer: true,
      releaseChannel: 'beta',
      submitURL: 'https://crashes.example.com/post',
    });
    expect(crashReporter.start).toHaveBeenCalledWith(expect.objectContaining({
      uploadToServer: true,
      submitURL: 'https://crashes.example.com/post',
    }));
  });

  it('ignores malformed upload endpoints', () => {
    const crashReporter = {start: jest.fn()};
    const status = startCrashReporting({
      app: appMock(true),
      crashReporter,
      env: {AI_PRODUCER_CRASH_UPLOAD_URL: 'file:///tmp/crashes'},
    });

    expect(status.uploadToServer).toBe(false);
    expect(crashReporter.start.mock.calls[0][0].submitURL).toBeUndefined();
  });
});
