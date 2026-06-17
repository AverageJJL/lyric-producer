import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {
  copyMediaFileIntoImports,
  reserveRenderedAudioImportPath,
  resolveWritableAssetPath,
} from '../electron/mediaAssetFiles';

describe('media asset file helpers', () => {
  let root: string;
  let writableRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-media-assets-'));
    writableRoot = path.join(root, 'assets');
    fs.mkdirSync(writableRoot, {recursive: true});
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('duplicates sources into imports with deterministic unique names', () => {
    const source = path.join(root, 'loop.wav');
    fs.writeFileSync(source, 'audio-bytes');
    const config = {assetRoots: () => ({readRoot: root, writableRoot})};

    const first = copyMediaFileIntoImports(config, source);
    const second = copyMediaFileIntoImports(config, source);

    expect(first).toMatchObject({
      ok: true,
      relativePath: 'imports/loop.wav',
      name: 'loop',
    });
    expect(second).toMatchObject({
      ok: true,
      relativePath: 'imports/loop-1.wav',
      name: 'loop',
    });
    expect(fs.readFileSync(first.absolutePath, 'utf8')).toBe('audio-bytes');
    expect(fs.readFileSync(second.absolutePath, 'utf8')).toBe('audio-bytes');
  });

  it('keeps relative media resolution inside the writable asset root', () => {
    const config = {assetRoots: () => ({readRoot: root, writableRoot})};

    expect(resolveWritableAssetPath(config, 'imports/loop.wav'))
      .toBe(path.join(writableRoot, 'imports/loop.wav'));
    expect(resolveWritableAssetPath(config, '../escape.wav')).toBeNull();
  });

  it('reserves project import paths for native audio renders', () => {
    const config = {assetRoots: () => ({readRoot: root, writableRoot})};

    const first = reserveRenderedAudioImportPath(config, 'Clip Render');
    fs.writeFileSync(first.absolutePath, 'rendered');
    const second = reserveRenderedAudioImportPath(config, 'Clip Render.wav');

    expect(first).toMatchObject({
      ok: true,
      relativePath: 'imports/Clip Render.wav',
      name: 'Clip Render',
    });
    expect(second).toMatchObject({
      ok: true,
      relativePath: 'imports/Clip Render-1.wav',
      name: 'Clip Render-1',
    });
  });
});
