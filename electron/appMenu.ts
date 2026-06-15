import type {MenuItemConstructorOptions} from 'electron';

export type AppProjectCommand =
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

export type AppProjectCommandSender = (command: AppProjectCommand) => void;

export function isProjectDocumentPath(filePath: string): boolean {
  return /\.(apcproject|json)$/i.test(filePath.trim());
}

export function isDawProjectPath(filePath: string): boolean {
  return /\.dawproject$/i.test(filePath.trim());
}

export function projectCommandForPath(filePath: string): AppProjectCommand | null {
  if (isDawProjectPath(filePath)) {
    return {command: 'importDawProjectPath', path: filePath};
  }
  return isProjectDocumentPath(filePath)
    ? {command: 'openProjectPath', path: filePath}
    : null;
}

function projectCommandItem(
  label: string,
  accelerator: string | undefined,
  command: AppProjectCommand,
  sendCommand: AppProjectCommandSender,
): MenuItemConstructorOptions {
  return {
    label,
    ...(accelerator ? {accelerator} : {}),
    click: () => sendCommand(command),
  };
}

function fileMenu(sendCommand: AppProjectCommandSender): MenuItemConstructorOptions {
  return {
    label: 'File',
    submenu: [
      projectCommandItem('New Project', 'CmdOrCtrl+N', {command: 'newProject'}, sendCommand),
      projectCommandItem('Open Project...', 'CmdOrCtrl+O', {command: 'openProject'}, sendCommand),
      projectCommandItem('Import DAWproject...', undefined, {command: 'importDawProject'}, sendCommand),
      {type: 'separator'},
      projectCommandItem('Save', 'CmdOrCtrl+S', {command: 'saveProject'}, sendCommand),
      projectCommandItem('Save As...', 'CmdOrCtrl+Shift+S', {command: 'saveProjectAs'}, sendCommand),
      {type: 'separator'},
      projectCommandItem('Export Mixdown...', 'CmdOrCtrl+E', {command: 'exportMixdown'}, sendCommand),
      projectCommandItem('Export Stems...', undefined, {command: 'exportStems'}, sendCommand),
      projectCommandItem('Export MIDI...', undefined, {command: 'exportMidi'}, sendCommand),
      projectCommandItem('Export DAWproject...', undefined, {command: 'exportDawProject'}, sendCommand),
      {type: 'separator'},
      projectCommandItem('Recover Autosave', undefined, {command: 'recoverAutosave'}, sendCommand),
    ],
  };
}

function editMenu(): MenuItemConstructorOptions {
  return {
    label: 'Edit',
    submenu: [
      {role: 'undo'},
      {role: 'redo'},
      {type: 'separator'},
      {role: 'cut'},
      {role: 'copy'},
      {role: 'paste'},
      {role: 'selectAll'},
    ],
  };
}

function viewMenu(): MenuItemConstructorOptions {
  return {
    label: 'View',
    submenu: [
      {role: 'reload'},
      {role: 'toggleDevTools'},
      {type: 'separator'},
      {role: 'resetZoom'},
      {role: 'zoomIn'},
      {role: 'zoomOut'},
      {type: 'separator'},
      {role: 'togglefullscreen'},
    ],
  };
}

function windowMenu(): MenuItemConstructorOptions {
  return {
    label: 'Window',
    submenu: [
      {role: 'minimize'},
      {role: 'zoom'},
      {type: 'separator'},
      {role: 'front'},
    ],
  };
}

function appMenu(): MenuItemConstructorOptions {
  return {
    label: 'AI Producer Core',
    submenu: [
      {role: 'about'},
      {type: 'separator'},
      {role: 'hide'},
      {role: 'hideOthers'},
      {role: 'unhide'},
      {type: 'separator'},
      {role: 'quit'},
    ],
  };
}

export function createAppMenuTemplate(
  sendCommand: AppProjectCommandSender,
  platform: NodeJS.Platform,
): MenuItemConstructorOptions[] {
  const menus = [fileMenu(sendCommand), editMenu(), viewMenu(), windowMenu()];
  return platform === 'darwin' ? [appMenu(), ...menus] : menus;
}
