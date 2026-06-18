import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

const mockHandlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
const mockShowOpenDialog = jest.fn();
const mockShowSaveDialog = jest.fn();

jest.mock('electron', () => ({
  dialog: {
    showOpenDialog: (...args: unknown[]) => mockShowOpenDialog(...args),
    showSaveDialog: (...args: unknown[]) => mockShowSaveDialog(...args),
  },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => Promise<unknown>) => {
      mockHandlers.set(channel, handler);
    },
  },
}));

import {registerFileIpc} from '../electron/fileIpc';

function handler(channel: string) {
  const registered = mockHandlers.get(channel);
  if (!registered) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return registered;
}

describe('file IPC', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-file-ipc-'));
    mockHandlers.clear();
    mockShowOpenDialog.mockReset();
    mockShowSaveDialog.mockReset();
    registerFileIpc({
      getMainWindow: () => null,
      assetRoots: () => ({readRoot: root, writableRoot: root}),
    });
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  // Removed: project-file:save / project-file:open handlers no longer live in
  // registerFileIpc (moved to apcProjectIpc.ts as folder-based .apc handlers).

  it('copies imported and duplicated audio into unique project import paths', async () => {
    const sourcePath = path.join(root, 'loop.wav');
    fs.writeFileSync(sourcePath, 'audio');

    const imported = await handler('media-file:import-audio')(null, {path: sourcePath});
    const duplicated = await handler('media-file:duplicate-audio')(null, {path: sourcePath});

    expect(imported).toMatchObject({
      ok: true,
      originalPath: sourcePath,
      relativePath: 'imports/loop.wav',
      name: 'loop',
    });
    expect(duplicated).toMatchObject({
      ok: true,
      originalPath: sourcePath,
      relativePath: 'imports/loop-1.wav',
      name: 'loop',
    });
    expect(fs.readFileSync(path.join(root, 'imports', 'loop.wav'), 'utf8')).toBe('audio');
    expect(fs.readFileSync(path.join(root, 'imports', 'loop-1.wav'), 'utf8')).toBe('audio');
  });

  it('writes MIDI exports with a MIDI extension', async () => {
    const target = path.join(root, 'arrangement');
    const payload = Buffer.from('midi payload');

    await expect(handler('project-file:write-midi')(null, {
      path: target,
      base64: payload.toString('base64'),
    })).resolves.toEqual({ok: true, path: `${target}.mid`});
    expect(fs.readFileSync(`${target}.mid`)).toEqual(payload);
  });
});
