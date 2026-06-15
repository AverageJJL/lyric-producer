import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const topLevelSubmodules = [
  'shared_cpp/third_party/juce',
  'shared_cpp/third_party/tracktion_engine',
];

const tracktionJuceSubmodule = 'modules/juce';
const tracktionJuceHttpsUrl = 'https://github.com/juce-framework/JUCE.git';

function runGit(args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  console.log(`$ git ${args.join(' ')}`);

  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readGit(args, options = {}) {
  const cwd = options.cwd ?? repoRoot;
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  return result.stdout;
}

function verifySubmodules() {
  const status = readGit(['submodule', 'status', '--recursive']);
  const invalidLines = status
    .split(/\r?\n/)
    .filter(Boolean)
    .filter(line => ['-', '+', 'U'].includes(line[0]));

  if (status.trim()) {
    console.log(status.trimEnd());
  }

  if (invalidLines.length === 0) {
    console.log('Submodules are initialized at the recorded commits.');
    return;
  }

  console.error('\nSubmodule verification failed. Unexpected entries:');
  for (const line of invalidLines) {
    console.error(line);
  }
  process.exit(1);
}

console.log('Preparing native audio engine submodules...');

// Keep root-level dependency URLs synced from .gitmodules, then materialize only
// the required native engine submodules. The nested Tracktion JUCE URL is
// intentionally handled separately because upstream Tracktion declares it as SSH.
runGit(['-c', 'submodule.recurse=false', 'submodule', 'sync', '--', ...topLevelSubmodules]);
runGit(['-c', 'submodule.recurse=false', 'submodule', 'update', '--init', '--', ...topLevelSubmodules]);

runGit([
  '-C',
  'shared_cpp/third_party/tracktion_engine',
  'config',
  `submodule.${tracktionJuceSubmodule}.url`,
  tracktionJuceHttpsUrl,
]);
runGit([
  '-C',
  'shared_cpp/third_party/tracktion_engine',
  '-c',
  'submodule.recurse=false',
  'submodule',
  'update',
  '--init',
  '--',
  tracktionJuceSubmodule,
]);

verifySubmodules();
