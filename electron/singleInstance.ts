import type {BrowserWindow} from 'electron';
import {projectCommandForPath, type AppProjectCommand} from './appMenu';

type WindowLike = Pick<BrowserWindow, 'isDestroyed' | 'isMinimized' | 'isVisible' | 'restore' | 'show' | 'focus'>;

export function projectCommandFromArgv(argv: string[]): AppProjectCommand | null {
  for (const arg of [...argv].reverse()) {
    if (arg.startsWith('-')) {
      continue;
    }
    const command = projectCommandForPath(arg);
    if (command) {
      return command;
    }
  }
  return null;
}

export function focusExistingWindow(window: WindowLike | null): boolean {
  if (!window || window.isDestroyed()) {
    return false;
  }
  if (window.isMinimized()) {
    window.restore();
  }
  if (!window.isVisible()) {
    window.show();
  }
  window.focus();
  return true;
}
