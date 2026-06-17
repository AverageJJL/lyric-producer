jest.mock('electron', () => ({
  BrowserWindow: {
    fromWebContents: jest.fn(),
  },
  Menu: {
    buildFromTemplate: jest.fn(() => ({popup: jest.fn()})),
  },
}));

import {
  createNativeContextMenuTemplate,
  nativeContextMenuKind,
} from '../electron/nativeContextMenu';

describe('native context menus', () => {
  it('uses editing roles for editable fields', () => {
    expect(nativeContextMenuKind({isEditable: true, selectionText: ''})).toBe('editable');
    expect(createNativeContextMenuTemplate('editable')).toEqual([
      {role: 'undo'},
      {role: 'redo'},
      {type: 'separator'},
      {role: 'cut'},
      {role: 'copy'},
      {role: 'paste'},
      {type: 'separator'},
      {role: 'selectAll'},
    ]);
  });

  it('uses copy only for selected non-editable text', () => {
    expect(nativeContextMenuKind({isEditable: false, selectionText: 'clip name'})).toBe('selection');
    expect(createNativeContextMenuTemplate('selection')).toEqual([{role: 'copy'}]);
  });

  it('suppresses empty app chrome menus', () => {
    expect(nativeContextMenuKind({isEditable: false, selectionText: '   '})).toBe('none');
    expect(createNativeContextMenuTemplate('none')).toEqual([]);
  });
});
