import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import {browseSamples} from '../electron/sampleProviderIpc';

function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

describe('sample provider IPC helpers', () => {
  let root: string;
  let readRoot: string;
  let writableRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'apc-sample-provider-'));
    readRoot = path.join(root, 'read');
    writableRoot = path.join(root, 'write');
    fs.mkdirSync(path.join(writableRoot, 'sample-library', 'core-drums'), {recursive: true});
    fs.mkdirSync(path.join(writableRoot, 'sample-library', 'core-keys'), {recursive: true});
    fs.writeFileSync(path.join(writableRoot, 'sample-library', 'core-drums', 'kick.wav'), 'kick');
    fs.writeFileSync(
      path.join(writableRoot, 'sample-library', 'core-drums', '.manifest.json'),
      JSON.stringify({
        packId: 'core-drums',
        family: 'drums',
        displayName: 'Core Drums',
        license: 'CC0-1.0',
        files: [{
          packId: 'core-drums',
          family: 'drums',
          relativePath: 'kick.wav',
          url: 'asset:drums/kick.wav',
          bytes: 4,
          sha256: sha256('kick'),
          tags: ['drums', 'kick'],
          displayName: 'Kick',
          sourceName: 'Fixture',
          sourceUrl: 'https://example.test',
          license: 'CC0-1.0',
          licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        }],
      }),
    );
  });

  afterEach(() => {
    fs.rmSync(root, {recursive: true, force: true});
  });

  it('lists only verified installed family-pack samples and supports family filtering', async () => {
    const config = {assetRoots: () => ({readRoot, writableRoot})};

    await expect(browseSamples(config, {
      providerId: 'royalty_free_library',
      family: 'drums',
    })).resolves.toMatchObject({
      ok: true,
      samples: [expect.objectContaining({
        name: 'Kick',
        packId: 'core-drums',
        family: 'drums',
      })],
    });
    await expect(browseSamples(config, {
      providerId: 'royalty_free_library',
      family: 'keys',
    })).resolves.toMatchObject({ok: true, samples: []});
  });

  it('does not list corrupted installed pack files', async () => {
    fs.writeFileSync(path.join(writableRoot, 'sample-library', 'core-drums', 'kick.wav'), 'bad');
    const config = {assetRoots: () => ({readRoot, writableRoot})};

    await expect(browseSamples(config, {providerId: 'royalty_free_library'}))
      .resolves.toMatchObject({ok: true, samples: []});
  });

  it('ignores stale public-domain keys manifests mislabeled as CC0', async () => {
    const keysRoot = path.join(writableRoot, 'sample-library', 'core-keys');
    fs.writeFileSync(path.join(keysRoot, 'piano.flac'), 'piano');
    fs.writeFileSync(path.join(keysRoot, '.manifest.json'), JSON.stringify({
      packId: 'core-keys',
      family: 'keys',
      displayName: 'Core Keys',
      license: 'CC0-1.0',
      files: [{
        packId: 'core-keys',
        family: 'keys',
        relativePath: 'piano.flac',
        bytes: 5,
        sha256: sha256('piano'),
        tags: ['keys'],
        displayName: 'Piano',
        sourceName: 'Splendid Grand Piano',
        sourceUrl: 'https://github.com/sfzinstruments/SplendidGrandPiano',
        license: 'CC0-1.0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
      }],
    }));
    const config = {assetRoots: () => ({readRoot, writableRoot})};

    await expect(browseSamples(config, {
      providerId: 'royalty_free_library',
      family: 'keys',
    })).resolves.toMatchObject({ok: true, samples: []});
  });

  it('ignores stale single-library manifests left by older cache versions', async () => {
    const staleRoot = path.join(writableRoot, 'sample-library', 'royalty-free-core');
    fs.mkdirSync(staleRoot, {recursive: true});
    fs.writeFileSync(path.join(staleRoot, '.manifest.json'), JSON.stringify({
      libraryId: 'royalty-free-core',
      files: [],
    }));
    const config = {assetRoots: () => ({readRoot, writableRoot})};

    await expect(browseSamples(config, {providerId: 'royalty_free_library'})).resolves.toMatchObject({
      ok: true,
      samples: [expect.objectContaining({name: 'Kick'})],
    });
  });
});
