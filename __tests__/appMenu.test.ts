import {
  createAppMenuTemplate,
  isDawProjectPath,
  isProjectDocumentPath,
  projectCommandForPath,
  type AppProjectCommand,
} from '../electron/appMenu';

function submenuItems(menu: {submenu?: unknown}): Array<{label?: string; click?: () => void}> {
  return Array.isArray(menu.submenu) ? menu.submenu as Array<{label?: string; click?: () => void}> : [];
}

describe('Electron app menu', () => {
  it('builds document lifecycle commands for project files', () => {
    const commands: AppProjectCommand[] = [];
    const template = createAppMenuTemplate(command => commands.push(command), 'darwin');
    const fileMenu = template.find(item => item.label === 'File');
    const saveItem = submenuItems(fileMenu!).find(item => item.label === 'Save');
    const openItem = submenuItems(fileMenu!).find(item => item.label === 'Open Project...');
    const importItem = submenuItems(fileMenu!).find(item => item.label === 'Import DAWproject...');
    const exportItem = submenuItems(fileMenu!).find(item => item.label === 'Export DAWproject...');

    saveItem?.click?.();
    openItem?.click?.();
    importItem?.click?.();
    exportItem?.click?.();

    expect(template[0]?.label).toBe('Aria');
    expect(commands).toEqual([
      {command: 'saveProject'},
      {command: 'openProject'},
      {command: 'importDawProject'},
      {command: 'exportDawProject'},
    ]);
  });

  it('detects project document paths for macOS open-file events', () => {
    // Project documents are now `.apc` folders; `.apcproject`/`.json` are no longer project paths.
    expect(isProjectDocumentPath('/tmp/song.apc')).toBe(true);
    expect(isProjectDocumentPath('/tmp/song.APC')).toBe(true);
    expect(isProjectDocumentPath('/tmp/song.apcproject')).toBe(false);
    expect(isProjectDocumentPath('/tmp/song.JSON')).toBe(false);
    expect(isDawProjectPath('/tmp/song.dawproject')).toBe(true);
    expect(projectCommandForPath('/tmp/song.dawproject')).toEqual({
      command: 'importDawProjectPath',
      path: '/tmp/song.dawproject',
    });
    expect(projectCommandForPath('/tmp/song.apc')).toEqual({
      command: 'openProjectPath',
      path: '/tmp/song.apc',
    });
    expect(isProjectDocumentPath('/tmp/audio.wav')).toBe(false);
  });
});
