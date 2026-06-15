import {existsSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const builtQaPath = path.join(repoRoot, 'dist-electron', 'permissionQa.js');

if (!existsSync(builtQaPath)) {
  console.error(`Built permission QA module missing: ${builtQaPath}`);
  console.error('Run npm run build:electron before npm run validate:permissions.');
  process.exit(1);
}

const require = createRequire(import.meta.url);
const {validatePermissionPromptQa} = require(builtQaPath);
const result = validatePermissionPromptQa();

if (!result.passed) {
  console.error([
    'Permission prompt QA failed:',
    ...result.failures.map(failure => `- ${failure}`),
  ].join('\n'));
  process.exit(1);
}

console.log(`Permission prompt QA passed with ${result.checks.length} checks.`);
