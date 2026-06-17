import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate';

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

import {registerDawProjectIpc} from '../electron/dawProjectIpc';

function handler(channel: string) {
  const registered = mockHandlers.get(channel);
  if (!registered) {
    throw new Error(`Missing handler for ${channel}`);
  }
  return registered;
}

describe('DAWproject IPC', () => {
  let root: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-dawproject-ipc-'));
    mockHandlers.clear();
    mockShowOpenDialog.mockReset();
    mockShowSaveDialog.mockReset();
    registerDawProjectIpc({
      getMainWindow: () => null,
      assetRoots: () => ({readRoot: root, writableRoot: root}),
    });
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('writes DAWproject ZIP exports with embedded media', async () => {
    const sourcePath = path.join(root, 'loop.wav');
    const targetPath = path.join(root, 'song');
    fs.writeFileSync(sourcePath, 'audio');
    mockShowSaveDialog.mockResolvedValue({canceled: false, filePath: targetPath});

    const saved = await handler('project-file:export-dawproject')(null, {
      defaultPath: targetPath,
      mediaFiles: [{archivePath: 'audio/loop.wav', sourcePath}],
      metadataXml: '<MetaData version="1.0"/>',
      projectXml: '<Project version="1.0"/>',
    });

    expect(saved).toEqual({ok: true, path: `${targetPath}.dawproject`});
    const entries = unzipSync(fs.readFileSync(`${targetPath}.dawproject`));
    expect(strFromU8(entries['project.xml']!)).toBe('<Project version="1.0"/>');
    expect(Buffer.from(entries['audio/loop.wav']!)).toEqual(Buffer.from('audio'));
  });

  it('rejects invalid ZIP imports and missing project.xml', async () => {
    const invalidPath = path.join(root, 'invalid.dawproject');
    const missingProjectPath = path.join(root, 'missing.dawproject');
    fs.writeFileSync(invalidPath, 'not a zip');
    fs.writeFileSync(missingProjectPath, zipSync({'metadata.xml': strToU8('<MetaData/>')}));

    await expect(handler('project-file:import-dawproject')(null, {path: invalidPath}))
      .resolves.toMatchObject({ok: false, error: 'DAWproject ZIP could not be read.'});
    await expect(handler('project-file:import-dawproject')(null, {path: missingProjectPath}))
      .resolves.toMatchObject({ok: false, error: 'DAWproject is missing project.xml.'});
  });

  it('extracts embedded audio into writable imports', async () => {
    const filePath = path.join(root, 'audio-project.dawproject');
    fs.writeFileSync(filePath, zipSync({
      'audio/take.wav': strToU8('audio bytes'),
      'extensions/ai-producer-core.json': strToU8('{"tracks":[]}'),
      'metadata.xml': strToU8('<MetaData/>'),
      'project.xml': strToU8('<Project version="1.0"/>'),
    }));

    const imported = await handler('project-file:import-dawproject')(null, {path: filePath});

    expect(imported).toMatchObject({
      ok: true,
      extensionJson: '{"tracks":[]}',
      mediaFiles: [{
        archivePath: 'audio/take.wav',
        relativePath: 'imports/take.wav',
      }],
    });
    expect(fs.readFileSync(path.join(root, 'imports', 'take.wav'), 'utf8')).toBe('audio bytes');
  });
});
