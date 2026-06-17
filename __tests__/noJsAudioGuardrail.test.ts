import {readdirSync, readFileSync, statSync} from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(__dirname, '..');
const scanRoots = ['src', 'electron'];
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs']);
const excludedPathParts = new Set([
  'node_modules',
  'dist',
  'dist-electron',
  'native',
]);

const forbiddenAudioApis = [
  'AudioContext',
  'webkitAudioContext',
  'getUserMedia',
  'AudioWorklet',
  'decodeAudioData',
  'AnalyserNode',
  'createAnalyser',
];

function shouldSkipPath(filePath: string) {
  return filePath
    .split(path.sep)
    .some(part => excludedPathParts.has(part));
}

function collectSourceFiles(root: string): string[] {
  const absoluteRoot = path.join(repoRoot, root);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(absoluteRoot, entry);
    if (shouldSkipPath(absolutePath)) {
      continue;
    }

    const stats = statSync(absolutePath);
    if (stats.isDirectory()) {
      files.push(...collectSourceFiles(path.relative(repoRoot, absolutePath)));
      continue;
    }

    if (sourceExtensions.has(path.extname(entry))) {
      files.push(absolutePath);
    }
  }

  return files;
}

describe('JS audio boundary guardrail', () => {
  it('keeps browser audio capture/analysis APIs out of the renderer bridge', () => {
    const violations = scanRoots
      .flatMap(collectSourceFiles)
      .flatMap(filePath => {
        const source = readFileSync(filePath, 'utf8');
        return forbiddenAudioApis
          .filter(api => source.includes(api))
          .map(api => `${path.relative(repoRoot, filePath)} uses ${api}`);
      });

    expect(violations).toEqual([]);
  });
});
