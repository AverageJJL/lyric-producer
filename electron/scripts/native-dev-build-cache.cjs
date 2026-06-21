const fs = require('node:fs');
const path = require('node:path');

const nativeAddonRelativePath = path.join(
  'electron',
  'native',
  'build-release',
  'Release',
  'native_audio_engine.node',
);

const nativeInputRoots = [
  'shared_cpp',
  path.join('electron', 'native'),
];

const nativeInputFiles = [
  path.join('node_modules', 'electron', 'package.json'),
  path.join('node_modules', 'node-addon-api', 'package.json'),
];

const ignoredDirectoryNames = new Set([
  '.git',
  'build',
  'build-release',
  'dist',
  'node_modules',
  'release',
  'third_party',
]);

function mtimeMs(filePath, statSync = fs.statSync) {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
}

function newestInputUnder(rootPath, options = {}) {
  const readdirSync = options.readdirSync ?? fs.readdirSync;
  const statSync = options.statSync ?? fs.statSync;
  let newest = {mtimeMs: 0, path: null};

  function visit(currentPath) {
    let entries;
    try {
      entries = readdirSync(currentPath, {withFileTypes: true});
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.') || ignoredDirectoryNames.has(entry.name)) {
        continue;
      }
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      const entryMtime = mtimeMs(entryPath, statSync);
      if (entryMtime !== null && entryMtime > newest.mtimeMs) {
        newest = {mtimeMs: entryMtime, path: entryPath};
      }
    }
  }

  visit(rootPath);
  return newest;
}

function newestNativeInput(repoRoot, options = {}) {
  const statSync = options.statSync ?? fs.statSync;
  let newest = {mtimeMs: 0, path: null};
  const consider = candidate => {
    if (candidate.mtimeMs > newest.mtimeMs) {
      newest = candidate;
    }
  };

  for (const relativeRoot of nativeInputRoots) {
    consider(newestInputUnder(path.join(repoRoot, relativeRoot), options));
  }

  for (const relativeFile of nativeInputFiles) {
    const filePath = path.join(repoRoot, relativeFile);
    const fileMtime = mtimeMs(filePath, statSync);
    if (fileMtime !== null) {
      consider({mtimeMs: fileMtime, path: filePath});
    }
  }

  return newest;
}

function nativeAddonFreshness(repoRoot, options = {}) {
  const statSync = options.statSync ?? fs.statSync;
  const addonPath = path.join(repoRoot, nativeAddonRelativePath);
  const addonMtimeMs = mtimeMs(addonPath, statSync);
  if (addonMtimeMs === null) {
    return {
      fresh: false,
      reason: 'missing',
      addonPath,
      newestInputPath: null,
    };
  }

  const newestInput = newestNativeInput(repoRoot, options);
  if (newestInput.mtimeMs > addonMtimeMs) {
    return {
      fresh: false,
      reason: 'stale',
      addonPath,
      addonMtimeMs,
      newestInputMtimeMs: newestInput.mtimeMs,
      newestInputPath: newestInput.path,
    };
  }

  return {
    fresh: true,
    reason: 'fresh',
    addonPath,
    addonMtimeMs,
    newestInputMtimeMs: newestInput.mtimeMs,
    newestInputPath: newestInput.path,
  };
}

module.exports = {
  nativeAddonFreshness,
  nativeAddonRelativePath,
  nativeInputFiles,
  nativeInputRoots,
  newestInputUnder,
  newestNativeInput,
};
