import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const {runNativeBuild} = require('./native-build-submodules.cjs');
const electronVersion = require('electron/package.json').version;
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const args = [
  'cmake-js',
  'compile',
  '--directory',
  'electron/native',
  '--out',
  'electron/native/build-release',
  '--runtime',
  'electron',
  '--runtime-version',
  electronVersion,
  '--config',
  'Release',
];

try {
  const status = runNativeBuild(repoRoot, args, {
    spawnSync,
  });
  process.exit(status);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
