export type AppLifecycleProjectCommand =
  | {command: 'newProject'}
  | {command: 'openProject'}
  | {command: 'openProjectPath'; path: string}
  | {command: 'importDawProject'}
  | {command: 'importDawProjectPath'; path: string}
  | {command: 'saveProject'}
  | {command: 'saveProjectAs'}
  | {command: 'exportMixdown'}
  | {command: 'exportStems'}
  | {command: 'exportMidi'}
  | {command: 'exportDawProject'}
  | {command: 'recoverAutosave'};

export type AppLifecycleBridge = {
  onProjectCommand: (
    callback: (command: AppLifecycleProjectCommand) => void,
  ) => () => void;
  rendererReady: () => void;
  setProjectDirty: (isDirty: boolean) => void;
};

declare global {
  interface Window {
    appLifecycle?: AppLifecycleBridge;
  }
}

export function getAppLifecycleBridge(): AppLifecycleBridge | null {
  return globalThis.window?.appLifecycle ?? null;
}
