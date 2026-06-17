export type AppPlatform = NodeJS.Platform;

export type AppEnvironmentBridge = {
  platform: AppPlatform;
};

declare global {
  interface Window {
    appEnvironment?: AppEnvironmentBridge;
  }
}

function inferPlatformFromNavigator(): AppPlatform {
  const platformHint = `${globalThis.navigator?.platform ?? ''} ${globalThis.navigator?.userAgent ?? ''}`;
  if (/win/i.test(platformHint)) {
    return 'win32';
  }
  if (/mac/i.test(platformHint)) {
    return 'darwin';
  }
  if (/linux/i.test(platformHint)) {
    return 'linux';
  }
  return 'darwin';
}

export function getAppPlatform(): AppPlatform {
  return globalThis.window?.appEnvironment?.platform ?? inferPlatformFromNavigator();
}
