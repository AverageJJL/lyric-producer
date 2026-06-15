import {BrowserWindow, Menu, type ContextMenuParams, type MenuItemConstructorOptions, type WebContents} from 'electron';

type NativeContextMenuParams = Pick<ContextMenuParams, 'isEditable' | 'selectionText'>;

export type NativeContextMenuKind = 'editable' | 'selection' | 'none';

export function nativeContextMenuKind(params: NativeContextMenuParams): NativeContextMenuKind {
  if (params.isEditable) {
    return 'editable';
  }
  return params.selectionText.trim().length > 0 ? 'selection' : 'none';
}

export function createNativeContextMenuTemplate(
  kind: NativeContextMenuKind,
): MenuItemConstructorOptions[] {
  if (kind === 'editable') {
    return [
      {role: 'undo'},
      {role: 'redo'},
      {type: 'separator'},
      {role: 'cut'},
      {role: 'copy'},
      {role: 'paste'},
      {type: 'separator'},
      {role: 'selectAll'},
    ];
  }

  if (kind === 'selection') {
    return [{role: 'copy'}];
  }

  return [];
}

export function installNativeContextMenu(webContents: WebContents): void {
  webContents.on('context-menu', (event, params) => {
    const template = createNativeContextMenuTemplate(nativeContextMenuKind(params));
    event.preventDefault();
    if (template.length === 0) {
      return;
    }

    Menu.buildFromTemplate(template).popup({
      window: BrowserWindow.fromWebContents(webContents) ?? undefined,
    });
  });
}
