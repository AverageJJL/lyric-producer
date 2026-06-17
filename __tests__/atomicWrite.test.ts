import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {writeFileAtomicSync} from '../electron/atomicWrite';

function tempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-atomic-'));
}

test('atomically replaces an existing project file and removes temp files', () => {
  const dir = tempProjectDir();
  try {
    const targetPath = path.join(dir, 'song.apcproject');
    fs.writeFileSync(targetPath, 'old project', 'utf8');

    writeFileAtomicSync(targetPath, 'new project', 'utf8');

    expect(fs.readFileSync(targetPath, 'utf8')).toBe('new project');
    expect(fs.readdirSync(dir).filter(file => file.includes('.tmp'))).toEqual([]);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('cleans temporary project files when the final path cannot be written', () => {
  const dir = tempProjectDir();
  try {
    const blockedPath = path.join(dir, 'blocked');
    fs.mkdirSync(blockedPath);

    expect(() => writeFileAtomicSync(blockedPath, 'project', 'utf8')).toThrow();
    expect(fs.readdirSync(dir).filter(file => file.includes('.tmp'))).toEqual([]);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
