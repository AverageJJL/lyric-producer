import {BrowserWindow, dialog, ipcMain} from 'electron';

export const DIRTY_PROJECT_CLOSE_MESSAGE = 'Discard unsaved project changes?';

let projectIsDirty = false;
let allowMainWindowClose = false;

export function resetProjectCloseGuard(): void {
  allowMainWindowClose = false;
}

export function registerProjectCloseGuardIpc(): void {
  ipcMain.on('app-lifecycle:set-project-dirty', (_event, isDirty: unknown) => {
    projectIsDirty = Boolean(isDirty);
  });
}

export function attachProjectCloseGuard(window: BrowserWindow): void {
  window.on('close', event => {
    if (allowMainWindowClose || !projectIsDirty) {
      return;
    }

    event.preventDefault();

    if (window.isDestroyed()) {
      return;
    }

    const choice = dialog.showMessageBoxSync(window, {
      type: 'warning',
      buttons: ['Cancel', 'Discard Changes'],
      defaultId: 0,
      cancelId: 0,
      message: DIRTY_PROJECT_CLOSE_MESSAGE,
    });

    if (choice === 1) {
      allowMainWindowClose = true;
      projectIsDirty = false;
      window.close();
    }
  });
}
