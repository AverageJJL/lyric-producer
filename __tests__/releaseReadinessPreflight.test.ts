import {execFileSync} from 'child_process';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..');

describe('release readiness preflight', () => {
  it('passes in config mode without requiring release credentials', () => {
    const output = execFileSync(
      process.execPath,
      ['electron/scripts/validate-release-readiness.mjs'],
      {cwd: repoRoot, encoding: 'utf8'},
    );

    expect(output).toContain('Release readiness preflight passed.');
  });
});
