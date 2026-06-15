import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const electronVersion = require('electron/package.json').version;

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

const result = spawnSync('npx', args, {stdio: 'inherit'});
process.exit(result.status ?? 1);
