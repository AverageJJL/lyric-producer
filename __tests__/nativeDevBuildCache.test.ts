import fs from 'fs';
import os from 'os';
import path from 'path';

import {
  nativeAddonFreshness,
  nativeAddonRelativePath,
} from '../electron/scripts/native-dev-build-cache.cjs';

function writeFixture(repoRoot: string, relativePath: string, timestamp: Date): void {
  const filePath = path.join(repoRoot, relativePath);
  fs.mkdirSync(path.dirname(filePath), {recursive: true});
  fs.writeFileSync(filePath, 'fixture');
  fs.utimesSync(filePath, timestamp, timestamp);
}

describe('native dev build cache', () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-native-dev-'));
    writeFixture(repoRoot, 'package.json', new Date('2026-01-01T00:00:00Z'));
    writeFixture(repoRoot, 'shared_cpp/AudioEngine.cpp', new Date('2026-01-01T00:00:00Z'));
    writeFixture(repoRoot, 'electron/native/NativeAudioEngineAddon.cpp', new Date('2026-01-01T00:00:00Z'));
  });

  afterEach(() => {
    fs.rmSync(repoRoot, {recursive: true, force: true});
  });

  it('is fresh when the addon is newer than app-owned native inputs', () => {
    writeFixture(repoRoot, nativeAddonRelativePath, new Date('2026-01-02T00:00:00Z'));

    expect(nativeAddonFreshness(repoRoot)).toMatchObject({
      fresh: true,
      reason: 'fresh',
    });
  });

  it('is stale when a native source is newer than the addon', () => {
    writeFixture(repoRoot, nativeAddonRelativePath, new Date('2026-01-02T00:00:00Z'));
    writeFixture(repoRoot, 'shared_cpp/AudioEngineController.cpp', new Date('2026-01-03T00:00:00Z'));

    expect(nativeAddonFreshness(repoRoot)).toMatchObject({
      fresh: false,
      reason: 'stale',
      newestInputPath: expect.stringContaining('AudioEngineController.cpp'),
    });
  });

  it('is stale when the native addon is missing', () => {
    expect(nativeAddonFreshness(repoRoot)).toMatchObject({
      fresh: false,
      reason: 'missing',
    });
  });

  it('ignores vendored third-party trees during the fast freshness scan', () => {
    writeFixture(repoRoot, nativeAddonRelativePath, new Date('2026-01-02T00:00:00Z'));
    writeFixture(
      repoRoot,
      'shared_cpp/third_party/tracktion_engine/CMakeLists.txt',
      new Date('2026-01-03T00:00:00Z'),
    );

    expect(nativeAddonFreshness(repoRoot)).toMatchObject({
      fresh: true,
      reason: 'fresh',
    });
  });
});
