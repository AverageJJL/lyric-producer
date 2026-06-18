/* eslint-disable @typescript-eslint/no-require-imports -- This runtime helper is CommonJS so build-native.mjs can load it through createRequire. */
const {existsSync} = require('node:fs');
const {resolve} = require('node:path');
const {spawnSync} = require('node:child_process');

const requiredSubmoduleSentinels = [
  {
    label: 'JUCE',
    path: 'shared_cpp/third_party/juce/CMakeLists.txt',
  },
  {
    label: 'Tracktion Engine',
    path: 'shared_cpp/third_party/tracktion_engine/CMakeLists.txt',
  },
  {
    label: 'Tracktion nested JUCE',
    path: 'shared_cpp/third_party/tracktion_engine/modules/juce/CMakeLists.txt',
  },
];

function commandForPlatform(command, platform = process.platform) {
  if (platform === 'win32' && !command.endsWith('.cmd')) {
    return `${command}.cmd`;
  }

  return command;
}

function missingSubmoduleSentinels(repoRoot, fileExists = existsSync) {
  return requiredSubmoduleSentinels.filter(sentinel => {
    return !fileExists(resolve(repoRoot, sentinel.path));
  });
}

function runCommand(command, args, options = {}) {
  const result = (options.spawnSync ?? spawnSync)(commandForPlatform(command, options.platform), args, {
    cwd: options.cwd,
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

function formatMissingSubmodules(missing) {
  return missing.map(sentinel => `${sentinel.label} (${sentinel.path})`).join(', ');
}

function ensureNativeSubmodules(repoRoot, options = {}) {
  const fileExists = options.existsSync ?? existsSync;
  // This preflight repairs absent checkouts only. Drifted-but-present submodules
  // may contain local vendor work, so deeper repair stays an explicit command.
  const firstMissing = missingSubmoduleSentinels(repoRoot, fileExists);

  if (firstMissing.length === 0) {
    return {ranSetup: false, missing: []};
  }

  console.log(
    `Native build submodules missing: ${formatMissingSubmodules(firstMissing)}. Running npm run setup:submodules...`,
  );

  const setupStatus = runCommand('npm', ['run', 'setup:submodules'], {
    cwd: repoRoot,
    platform: options.platform,
    spawnSync: options.spawnSync,
  });

  if (setupStatus !== 0) {
    throw new Error(`Submodule setup failed with exit code ${setupStatus}.`);
  }

  const remainingMissing = missingSubmoduleSentinels(repoRoot, fileExists);
  if (remainingMissing.length > 0) {
    throw new Error(
      `Submodule setup completed, but native build submodules are still missing: ${formatMissingSubmodules(
        remainingMissing,
      )}.`,
    );
  }

  return {ranSetup: true, missing: []};
}

function runNativeBuild(repoRoot, buildArgs, options = {}) {
  ensureNativeSubmodules(repoRoot, options);
  return runCommand('npx', buildArgs, {
    cwd: repoRoot,
    platform: options.platform,
    spawnSync: options.spawnSync,
  });
}

module.exports = {
  commandForPlatform,
  ensureNativeSubmodules,
  missingSubmoduleSentinels,
  requiredSubmoduleSentinels,
  runNativeBuild,
  runCommand,
};
