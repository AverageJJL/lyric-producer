import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const packagePath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

function includes(items, needle) {
  return Array.isArray(items) && items.some(item => String(item).includes(needle));
}

function packageResourceMatches(item, from, to) {
  return item && typeof item === 'object' && item.from === from && item.to === to;
}

function requirePath(errors, relativePath, hint) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    errors.push(`${hint}: ${absolutePath}`);
  }
}

function requireConfiguredPath(errors, relativePath, hint) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    errors.push(`${hint}: path is not configured.`);
    return;
  }
  requirePath(errors, relativePath, hint);
}

function assertMacPackaging() {
  const errors = [];
  const build = packageJson.build ?? {};
  const scripts = packageJson.scripts ?? {};

  if (packageJson.main !== 'dist-electron/main.js') {
    errors.push('Electron main must point at dist-electron/main.js.');
  }
  if (!scripts.build || !scripts['build:engine'] || !scripts['build:electron']) {
    errors.push('Missing build, build:engine, or build:electron scripts.');
  }
  if (!scripts['validate:macos']) {
    errors.push('Missing validate:macos package script.');
  }
  if (!scripts['validate:release']) {
    errors.push('Missing validate:release package script.');
  }
  if (!scripts.pack || !scripts.dist) {
    errors.push('Missing Electron Builder pack/dist scripts.');
  }
  if (build.appId !== 'com.musicapp.aria') {
    errors.push('macOS package appId is not stable.');
  }
  if (build.productName !== 'Aria') {
    errors.push('macOS package productName must match the desktop product.');
  }
  if (!build.mac) {
    errors.push('Missing Electron Builder mac target config.');
  }
  if (build.mac?.category !== 'public.app-category.music') {
    errors.push('macOS package category must be public.app-category.music.');
  }
  if (build.mac?.identity === null) {
    errors.push('macOS package must not set identity to null because that disables signing.');
  }
  if (build.mac?.hardenedRuntime !== true) {
    errors.push('macOS package must enable hardened runtime.');
  }
  if (build.mac?.gatekeeperAssess !== false) {
    errors.push('macOS package gatekeeperAssess must stay false for notarized Developer ID builds.');
  }
  if (build.mac?.notarize === false) {
    errors.push('macOS package must not disable notarization.');
  }
  if (!build.mac?.extendInfo?.NSMicrophoneUsageDescription) {
    errors.push('macOS package must include a microphone permission description.');
  }
  if (build.directories?.output !== 'release') {
    errors.push('Electron Builder output directory must remain release.');
  }
  if (!includes(build.files, 'dist-electron/**/*')) {
    errors.push('macOS package files must include Electron main/preload builds.');
  }
  if (!includes(build.files, 'dist/renderer/**/*')) {
    errors.push('macOS package files must include the Vite renderer build.');
  }
  if (!includes(build.files, 'electron/native/build-release/Release/native_audio_engine.node')) {
    errors.push('macOS package files must include the release native addon.');
  }
  if (includes(build.files, 'electron/native/build-release/**/*') || includes(build.files, 'electron/native/build/**/*')) {
    errors.push('macOS package files must not include native CMake build trees.');
  }
  if (!includes(build.files, 'package.json')) {
    errors.push('macOS package files must include package.json metadata.');
  }
  if (!includes(build.asarUnpack, 'electron/native/build-release/Release/native_audio_engine.node')) {
    errors.push('Release native .node addon must be unpacked from ASAR.');
  }
  const hasSampleMetadata = Array.isArray(build.extraResources)
    && build.extraResources.some(item => packageResourceMatches(item, 'assets/sample-library', 'assets/sample-library'));
  const hasSongSeedMetadata = Array.isArray(build.extraResources)
    && build.extraResources.some(item => packageResourceMatches(item, 'assets/song-seed', 'assets/song-seed'));
  const bundlesAllAssets = Array.isArray(build.extraResources)
    && build.extraResources.some(item => packageResourceMatches(item, 'assets', 'assets'));
  if (!hasSampleMetadata) {
    errors.push('macOS package must copy sample-library metadata as extra resources.');
  }
  if (!hasSongSeedMetadata) {
    errors.push('macOS package must copy song-seed metadata as extra resources.');
  }
  if (bundlesAllAssets) {
    errors.push('macOS package must not copy the full assets folder because sample audio is downloadable.');
  }

  requireConfiguredPath(errors, build.mac?.entitlements, 'Main macOS entitlements missing');
  requireConfiguredPath(errors, build.mac?.entitlementsInherit, 'Inherited macOS entitlements missing');
  requirePath(errors, 'dist-electron/main.js', 'Built Electron main missing; run npm run build');
  requirePath(errors, 'dist-electron/preload.js', 'Built Electron preload missing; run npm run build');
  requirePath(errors, 'dist/renderer/index.html', 'Built renderer missing; run npm run build');
  requirePath(
    errors,
    'electron/native/build-release/Release/native_audio_engine.node',
    'Native addon missing; run npm run build:engine',
  );
  requirePath(errors, 'assets/drums/icons', 'Bundled drum lane icons missing');
  requirePath(
    errors,
    'assets/sample-library/cc0-core.catalog.json',
    'Sample library metadata missing',
  );
  requirePath(
    errors,
    'assets/song-seed/reference-cache.seed.json',
    'Song seed reference cache metadata missing',
  );
  requirePath(
    errors,
    'assets/song-seed/demo-config.json',
    'Public demo config missing',
  );
  requirePath(
    errors,
    'assets/song-seed/demo-song-seeds.json',
    'Public demo song fixtures missing',
  );
  requirePath(errors, 'assets/instruments', 'Bundled instrument assets missing');

  return errors;
}

const errors = assertMacPackaging();
if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log('macOS package preflight passed: config, build artifacts, native addon, and assets are present.');
