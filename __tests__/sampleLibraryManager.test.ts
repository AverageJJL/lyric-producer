import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

import {SampleLibraryManager} from '../electron/sampleLibraryManager';
import type {SampleLibraryManifest} from '../electron/sampleLibraryTypes';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function writeManifest(root: string, manifest: SampleLibraryManifest): string {
  const manifestPath = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
  return pathToFileURL(manifestPath).toString();
}

function file(packId: string, family: 'drums' | 'keys', name: string, text: string) {
  return {
    packId,
    family,
    relativePath: `${name}.wav`,
    url: `memory://${name}`,
    bytes: text.length,
    sha256: sha256(text),
    tags: [family, name],
    displayName: name,
    sourceName: 'Fixture',
    sourceUrl: 'https://example.test',
    license: 'CC0-1.0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  };
}

function manifest(): SampleLibraryManifest {
  return {
    libraryId: 'cc0-core',
    displayName: 'CC0 Core Library',
    license: 'CC0-1.0',
    packs: [
      {
        packId: 'core-drums',
        family: 'drums',
        displayName: 'Core Drums',
        license: 'CC0-1.0',
        files: [file('core-drums', 'drums', 'kick', 'kick')],
      },
      {
        packId: 'core-keys',
        family: 'keys',
        displayName: 'Core Keys',
        license: 'CC0-1.0',
        files: [file('core-keys', 'keys', 'piano', 'piano')],
      },
    ],
  };
}

describe('SampleLibraryManager', () => {
  let root: string;
  let readRoot: string;
  let writableRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-sample-library-'));
    readRoot = path.join(root, 'read');
    writableRoot = path.join(root, 'write');
    fs.mkdirSync(path.join(readRoot, 'sample-library'), {recursive: true});
    fs.mkdirSync(writableRoot, {recursive: true});
    fs.writeFileSync(
      path.join(readRoot, 'sample-library', 'cc0-core.catalog.json'),
      JSON.stringify({
        libraryId: 'cc0-core',
        displayName: 'CC0 Core Library',
        license: 'CC0-1.0',
        packs: manifest().packs.map(pack => ({
          id: pack.packId,
          family: pack.family,
          displayName: pack.displayName,
          license: pack.license,
          fileCount: pack.files.length,
          totalBytes: pack.files.reduce((sum, item) => sum + item.bytes, 0),
        })),
      }),
      'utf8',
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('reports missing grouped packs before download', async () => {
    const manager = new SampleLibraryManager({assetRoots: () => ({readRoot, writableRoot})});

    await expect(manager.status()).resolves.toMatchObject({
      state: 'missing',
      fileCount: 2,
      packs: [
        expect.objectContaining({id: 'core-drums', state: 'missing'}),
        expect.objectContaining({id: 'core-keys', state: 'missing'}),
      ],
    });
  });

  it('downloads all packs and skips verified files on the second run', async () => {
    const manifestUrl = writeManifest(root, manifest());
    const payloads = new Map([['memory://kick', 'kick'], ['memory://piano', 'piano']]);
    const downloadFile = jest.fn(async (url: string, targetPath: string) => {
      fs.writeFileSync(targetPath, payloads.get(url) ?? '', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });

    await expect(manager.download()).resolves.toMatchObject({state: 'installed'});
    expect(downloadFile).toHaveBeenCalledTimes(2);
    await expect(manager.download()).resolves.toMatchObject({state: 'installed'});
    expect(downloadFile).toHaveBeenCalledTimes(2);
  });

  it('persists the hosted manifest catalog for later status calls', async () => {
    const hostedManifest = manifest();
    hostedManifest.packs[1].files.push(file('core-keys', 'keys', 'clav', 'clav'));
    const manifestUrl = writeManifest(root, hostedManifest);
    const payloads = new Map([
      ['memory://kick', 'kick'],
      ['memory://piano', 'piano'],
      ['memory://clav', 'clav'],
    ]);
    const downloadFile = jest.fn(async (url: string, targetPath: string) => {
      fs.writeFileSync(targetPath, payloads.get(url) ?? '', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });

    await manager.download();
    const restarted = new SampleLibraryManager({assetRoots: () => ({readRoot, writableRoot})});

    await expect(restarted.status()).resolves.toMatchObject({
      fileCount: 3,
      packs: expect.arrayContaining([
        expect.objectContaining({id: 'core-keys', fileCount: 2, state: 'installed'}),
      ]),
    });
  });

  it('downloads and deletes a single pack', async () => {
    const manifestUrl = writeManifest(root, manifest());
    const downloadFile = jest.fn(async (_url: string, targetPath: string) => {
      fs.writeFileSync(targetPath, 'kick', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });

    await expect(manager.download({packId: 'core-drums'})).resolves.toMatchObject({
      packs: [
        expect.objectContaining({id: 'core-drums', state: 'installed'}),
        expect.objectContaining({id: 'core-keys', state: 'missing'}),
      ],
    });
    await expect(manager.delete({packId: 'core-drums'})).resolves.toMatchObject({
      packs: expect.arrayContaining([
        expect.objectContaining({id: 'core-drums', state: 'missing'}),
      ]),
    });
  });

  it('uses the local dev manifest when no manifest URL is configured', async () => {
    const localManifest = manifest();
    localManifest.packs[0].files[0].url = 'asset:drums/kick.wav';
    localManifest.packs[1].files = [];
    fs.writeFileSync(
      path.join(readRoot, 'sample-library', 'cc0-core.dev-manifest.json'),
      JSON.stringify(localManifest),
      'utf8',
    );
    fs.mkdirSync(path.join(readRoot, 'drums'), {recursive: true});
    fs.writeFileSync(path.join(readRoot, 'drums', 'kick.wav'), 'kick', 'utf8');
    const downloadFile = jest.fn();
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => '',
      downloadFile,
    });

    await expect(manager.download({packId: 'core-drums'})).resolves.toMatchObject({
      packs: expect.arrayContaining([
        expect.objectContaining({id: 'core-drums', state: 'installed'}),
      ]),
    });
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it('recovers only invalid files and cleans failed temp downloads', async () => {
    const manifestUrl = writeManifest(root, manifest());
    const payloads = new Map([['memory://kick', 'kick'], ['memory://piano', 'piano']]);
    const downloadFile = jest.fn(async (url: string, targetPath: string) => {
      fs.writeFileSync(targetPath, payloads.get(url) ?? 'bad', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });
    await manager.download();
    fs.writeFileSync(path.join(writableRoot, 'sample-library', 'core-keys', 'piano.wav'), 'wrong');

    await expect(manager.download()).resolves.toMatchObject({state: 'installed'});
    expect(downloadFile).toHaveBeenCalledTimes(3);

    payloads.set('memory://kick', 'nope');
    fs.writeFileSync(path.join(writableRoot, 'sample-library', 'core-drums', 'kick.wav'), 'bad!');
    await expect(manager.download({packId: 'core-drums'})).resolves.toMatchObject({
      state: 'error',
      error: expect.stringContaining('integrity check'),
    });
    expect(fs.existsSync(
      path.join(writableRoot, 'sample-library', 'core-drums', 'kick.wav.download'),
    )).toBe(false);
  });

  it('cancels an in-flight pack download', async () => {
    const manifestUrl = writeManifest(root, manifest());
    const downloadFile = jest.fn(async (_url: string, targetPath: string, isCanceled: () => boolean) => {
      fs.writeFileSync(targetPath, 'part', 'utf8');
      await new Promise(resolve => setTimeout(resolve, 10));
      if (isCanceled()) {
        throw new Error('Download canceled.');
      }
      fs.writeFileSync(targetPath, 'kick', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });

    const download = manager.download({packId: 'core-drums'});
    await new Promise(resolve => setTimeout(resolve, 0));
    await manager.cancel({packId: 'core-drums'});

    await expect(download).resolves.toMatchObject({
      state: 'error',
      error: expect.stringContaining('canceled'),
    });
  });

  it('cancels Download All when a pack-row cancel request is sent', async () => {
    const manifestUrl = writeManifest(root, manifest());
    const downloadFile = jest.fn(async (_url: string, targetPath: string, isCanceled: () => boolean) => {
      fs.writeFileSync(targetPath, 'part', 'utf8');
      await new Promise(resolve => setTimeout(resolve, 10));
      if (isCanceled()) {
        throw new Error('Download canceled.');
      }
      fs.writeFileSync(targetPath, 'kick', 'utf8');
    });
    const manager = new SampleLibraryManager({
      assetRoots: () => ({readRoot, writableRoot}),
      manifestUrl: () => manifestUrl,
      downloadFile,
    });

    const download = manager.download();
    await new Promise(resolve => setTimeout(resolve, 0));
    await manager.cancel({packId: 'core-drums'});

    await expect(download).resolves.toMatchObject({
      state: 'error',
      error: expect.stringContaining('canceled'),
    });
  });
});
