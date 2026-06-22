import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

function includes(items: unknown, needle: string): boolean {
  return Array.isArray(items) && items.some(item => String(item).includes(needle));
}

function readEntitlements(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function hasTrueEntitlement(contents: string, key: string): boolean {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<key>${escapedKey}</key>\\s*<true\\s*/>`).test(contents);
}

describe('macOS package configuration', () => {
  it('keeps the Electron macOS package wired to built native artifacts', () => {
    const build = packageJson.build ?? {};
    const scripts = packageJson.scripts ?? {};

    expect(packageJson.main).toBe('dist-electron/main.js');
    expect(scripts).toMatchObject({
      build: expect.any(String),
      'build:engine': expect.any(String),
      'build:electron': expect.any(String),
      'validate:macos': 'node electron/scripts/validate-macos-package.mjs',
      'validate:permissions': 'node electron/scripts/validate-permission-qa.mjs',
      'validate:release': 'node electron/scripts/validate-release-readiness.mjs',
      'validate:release-artifacts': 'node electron/scripts/validate-release-artifacts.mjs',
      pack: expect.any(String),
      dist: expect.any(String),
    });
    expect(scripts.pack).toBe('npm run build && electron-builder --dir');
    expect(scripts.dist).toBe('npm run build && electron-builder');
    expect(build).toMatchObject({
      appId: 'com.musicapp.aria',
      productName: 'Aria',
      directories: {output: 'release'},
      mac: {
        category: 'public.app-category.music',
        hardenedRuntime: true,
        gatekeeperAssess: false,
        entitlements: 'electron/signing/entitlements.mac.plist',
        entitlementsInherit: 'electron/signing/entitlements.mac.inherit.plist',
        notarize: true,
      },
    });
    expect(build.mac).not.toHaveProperty('identity', null);
    expect(build.mac.extendInfo.NSMicrophoneUsageDescription).toContain('microphone audio');
    expect(includes(build.files, 'dist-electron/**/*')).toBe(true);
    expect(includes(build.files, 'dist/renderer/**/*')).toBe(true);
    expect(includes(build.files, 'electron/native/build-release/Release/native_audio_engine.node')).toBe(true);
    expect(includes(build.files, 'electron/native/build-release/**/*')).toBe(false);
    expect(includes(build.files, 'electron/native/build/**/*')).toBe(false);
    expect(includes(build.files, 'package.json')).toBe(true);
    expect(includes(build.asarUnpack, 'electron/native/build-release/Release/native_audio_engine.node')).toBe(true);
    expect(build.extraResources).toEqual(expect.arrayContaining([
      expect.objectContaining({from: 'assets/instruments', to: 'assets/instruments'}),
      expect.objectContaining({from: 'assets/drums/icons', to: 'assets/drums/icons'}),
      expect.objectContaining({from: 'assets/sample-library', to: 'assets/sample-library'}),
      expect.objectContaining({from: 'assets/song-seed', to: 'assets/song-seed'}),
    ]));
    expect(build.extraResources).not.toEqual(
      expect.arrayContaining([expect.objectContaining({from: 'assets', to: 'assets'})]),
    );
    expect(fs.existsSync(path.join(repoRoot, 'assets/song-seed/demo-config.json'))).toBe(true);
    expect(fs.existsSync(path.join(repoRoot, 'assets/song-seed/demo-song-seeds.json'))).toBe(true);
  });

  it('keeps hardened-runtime entitlements available for Electron and the native addon', () => {
    const {mac} = packageJson.build;
    const mainEntitlements = readEntitlements(mac.entitlements);
    const childEntitlements = readEntitlements(mac.entitlementsInherit);

    for (const key of [
      'com.apple.security.cs.allow-jit',
      'com.apple.security.cs.allow-unsigned-executable-memory',
      'com.apple.security.cs.disable-library-validation',
    ]) {
      expect(hasTrueEntitlement(mainEntitlements, key)).toBe(true);
      expect(hasTrueEntitlement(childEntitlements, key)).toBe(true);
    }
    expect(hasTrueEntitlement(mainEntitlements, 'com.apple.security.device.audio-input')).toBe(true);
  });
});
