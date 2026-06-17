import {execFileSync} from 'child_process';
import path from 'path';

const repoRoot = path.resolve(__dirname, '..');

describe('release artifact validation', () => {
  it('keeps the artifact validator runnable without real release outputs', () => {
    const output = execFileSync(
      process.execPath,
      ['electron/scripts/validate-release-artifacts.mjs'],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {...process.env, RELEASE_ARTIFACT_SELFTEST: '1'},
      },
    );

    expect(output).toContain('Release artifact validation selftest passed.');
  });
});
