import {focusExistingWindow, projectCommandFromArgv} from '../electron/singleInstance';

describe('single-instance desktop lifecycle', () => {
  it('extracts project commands from second-instance argv', () => {
    expect(projectCommandFromArgv([
      'AI Producer Core.exe',
      '--some-flag',
      'C:\\sessions\\song.apc',
    ])).toEqual({
      command: 'openProjectPath',
      path: 'C:\\sessions\\song.apc',
    });

    expect(projectCommandFromArgv(['app.exe', 'C:\\sessions\\song.dawproject'])).toEqual({
      command: 'importDawProjectPath',
      path: 'C:\\sessions\\song.dawproject',
    });
  });

  it('restores and focuses an existing native window', () => {
    const window = {
      isDestroyed: jest.fn(() => false),
      isMinimized: jest.fn(() => true),
      isVisible: jest.fn(() => false),
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
    };

    expect(focusExistingWindow(window)).toBe(true);
    expect(window.restore).toHaveBeenCalled();
    expect(window.show).toHaveBeenCalled();
    expect(window.focus).toHaveBeenCalled();
  });

  it('reports when there is no reusable native window', () => {
    expect(focusExistingWindow(null)).toBe(false);
    expect(focusExistingWindow({
      isDestroyed: () => true,
      isMinimized: () => false,
      isVisible: () => true,
      restore: jest.fn(),
      show: jest.fn(),
      focus: jest.fn(),
    })).toBe(false);
  });
});
