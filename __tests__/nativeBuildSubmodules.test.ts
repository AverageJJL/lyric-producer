import {
  commandForPlatform,
  ensureNativeSubmodules,
  runNativeBuild,
  runCommand,
} from '../electron/scripts/native-build-submodules.cjs';

describe('native build submodule preflight', () => {
  const repoRoot = '/repo';
  const sentinelSuffixes = [
    'shared_cpp/third_party/juce/CMakeLists.txt',
    'shared_cpp/third_party/tracktion_engine/CMakeLists.txt',
    'shared_cpp/third_party/tracktion_engine/modules/juce/CMakeLists.txt',
  ];
  let consoleLogSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
  });

  function createExistsMock(missingSuffixes: string[]) {
    return jest.fn((path: string) => {
      return !missingSuffixes.some(suffix => path.endsWith(suffix));
    });
  }

  it('skips setup and invokes native build when all sentinels exist', () => {
    const spawn = jest.fn(() => ({status: 0}));
    const status = runNativeBuild(repoRoot, ['cmake-js'], {
      existsSync: createExistsMock([]),
      spawnSync: spawn,
    });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(spawn).toHaveBeenCalledWith('npx', ['cmake-js'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });

  it('runs setup once when a sentinel is missing, then invokes native build after re-check', () => {
    let checkCount = 0;
    const exists = jest.fn((path: string) => {
      const isJuce = path.endsWith(sentinelSuffixes[0]);
      checkCount += isJuce ? 1 : 0;
      return !isJuce || checkCount > 1;
    });
    const spawn = jest.fn(() => ({status: 0}));

    const status = runNativeBuild(repoRoot, ['cmake-js'], {
      existsSync: exists,
      spawnSync: spawn,
    });

    expect(status).toBe(0);
    expect(spawn).toHaveBeenNthCalledWith(1, 'npm', ['run', 'setup:submodules'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    expect(spawn).toHaveBeenNthCalledWith(2, 'npx', ['cmake-js'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });

  it('fails before native build when setup exits nonzero', () => {
    const spawn = jest.fn(() => ({status: 7}));

    expect(() =>
      ensureNativeSubmodules(repoRoot, {
        existsSync: createExistsMock([sentinelSuffixes[1]]),
        spawnSync: spawn,
      }),
    ).toThrow('Submodule setup failed with exit code 7.');
  });

  it('fails when setup succeeds but a sentinel remains missing', () => {
    const spawn = jest.fn(() => ({status: 0}));

    expect(() =>
      ensureNativeSubmodules(repoRoot, {
        existsSync: createExistsMock([sentinelSuffixes[2]]),
        spawnSync: spawn,
      }),
    ).toThrow('Tracktion nested JUCE');
  });

  it('uses .cmd shims on Windows for npm and npx commands', () => {
    const spawn = jest.fn(() => ({status: 0}));

    expect(commandForPlatform('npm', 'win32')).toBe('npm.cmd');
    expect(runCommand('npx', ['cmake-js'], {cwd: repoRoot, platform: 'win32', spawnSync: spawn})).toBe(0);
    expect(spawn).toHaveBeenCalledWith('npx.cmd', ['cmake-js'], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  });
});
