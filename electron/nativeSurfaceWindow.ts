import type {BrowserWindowConstructorOptions, WebContents} from 'electron';
import {installNativeContextMenu} from './nativeContextMenu';

const FALLBACK_BACKGROUND_COLOR = '#161719';

export function createNativeSurfaceWindowOptions(
  platform: NodeJS.Platform,
): BrowserWindowConstructorOptions {
  if (platform === 'darwin') {
    return {
      backgroundColor: FALLBACK_BACKGROUND_COLOR,
      titleBarStyle: 'hiddenInset',
      trafficLightPosition: {x: 14, y: 16},
      transparent: true,
      vibrancy: 'under-window',
      visualEffectState: 'followWindow',
    };
  }

  if (platform === 'win32') {
    return {
      backgroundColor: FALLBACK_BACKGROUND_COLOR,
      backgroundMaterial: 'mica',
    };
  }

  return {backgroundColor: FALLBACK_BACKGROUND_COLOR};
}

export function installNativeSurfaceWebContents(webContents: WebContents): void {
  installNativeContextMenu(webContents);
}
