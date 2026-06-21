import {useEffect} from 'react';

import {getAppLifecycleBridge, type AppLifecycleProjectCommand} from '../native/appLifecycleApi';

type ProjectCommandHandlers = {
  newProject: () => Promise<unknown>;
  openProject: () => Promise<void>;
  openRecentProject: (path: string) => Promise<void>;
  importDawProject: () => Promise<void>;
  importDawProjectPath: (path: string) => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  exportMixdown: () => Promise<void>;
  exportStems: () => Promise<void>;
  exportMidi: () => Promise<void>;
  exportDawProject: () => Promise<void>;
  recoverAutosave: () => Promise<void>;
};

function runAppCommand(
  command: AppLifecycleProjectCommand,
  handlers: ProjectCommandHandlers,
): Promise<unknown> {
  switch (command.command) {
    case 'newProject':
      return handlers.newProject();
    case 'openProject':
      return handlers.openProject();
    case 'openProjectPath':
      return handlers.openRecentProject(command.path);
    case 'importDawProject':
      return handlers.importDawProject();
    case 'importDawProjectPath':
      return handlers.importDawProjectPath(command.path);
    case 'saveProject':
      return handlers.saveProject();
    case 'saveProjectAs':
      return handlers.saveProjectAs();
    case 'exportMixdown':
      return handlers.exportMixdown();
    case 'exportStems':
      return handlers.exportStems();
    case 'exportMidi':
      return handlers.exportMidi();
    case 'exportDawProject':
      return handlers.exportDawProject();
    case 'recoverAutosave':
      return handlers.recoverAutosave();
  }
}

export function useAppProjectCommands({
  newProject,
  openProject,
  openRecentProject,
  importDawProject,
  importDawProjectPath,
  saveProject,
  saveProjectAs,
  exportMixdown,
  exportStems,
  exportMidi,
  exportDawProject,
  recoverAutosave,
}: ProjectCommandHandlers): void {
  useEffect(() => {
    const bridge = getAppLifecycleBridge();
    if (!bridge) {
      return undefined;
    }
    const handlers = {
      newProject,
      openProject,
      openRecentProject,
      importDawProject,
      importDawProjectPath,
      saveProject,
      saveProjectAs,
      exportMixdown,
      exportStems,
      exportMidi,
      exportDawProject,
      recoverAutosave,
    };
    const unsubscribe = bridge.onProjectCommand(command => {
      void runAppCommand(command, handlers);
    });
    bridge.rendererReady();
    return unsubscribe;
  }, [
    exportMidi,
    exportDawProject,
    exportMixdown,
    exportStems,
    importDawProject,
    importDawProjectPath,
    newProject,
    openProject,
    openRecentProject,
    recoverAutosave,
    saveProject,
    saveProjectAs,
  ]);
}
