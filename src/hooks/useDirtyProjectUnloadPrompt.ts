import {useEffect} from 'react';

import {getAppLifecycleBridge} from '../native/appLifecycleApi';

export const DIRTY_PROJECT_DISCARD_PROMPT = 'Discard unsaved project changes?';

export function confirmDirtyProjectDiscard(isDirty: boolean): boolean {
  if (!isDirty) {
    return true;
  }
  return globalThis.window?.confirm?.(DIRTY_PROJECT_DISCARD_PROMPT) ?? true;
}

export function useDirtyProjectUnloadPrompt(isDirty: boolean): void {
  useEffect(() => {
    getAppLifecycleBridge()?.setProjectDirty(isDirty);
  }, [isDirty]);

  useEffect(() => {
    // Electron handles dirty close prompts in the main process; beforeunload
    // cannot show custom dialogs reliably in Chromium during unload.
    if (getAppLifecycleBridge()) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!isDirty) {
        return;
      }

      event.preventDefault();
      event.returnValue = DIRTY_PROJECT_DISCARD_PROMPT;
    };

    globalThis.window?.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      globalThis.window?.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isDirty]);
}
