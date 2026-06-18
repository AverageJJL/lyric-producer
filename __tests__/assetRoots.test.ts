import {appWideAssetRoots, projectMediaRoots} from '../electron/assetRoots';

const baseEnv = {
  isPackaged: false,
  resourcesPath: '/res',
  appPath: '/app',
  userDataPath: '/userData',
  activeProjectFolder: null as string | null,
  ensureDir: () => {},
};

describe('asset roots split (per-project media vs app-wide library)', () => {
  it('points project media at Song.apc/assets when a project is open', () => {
    const made: string[] = [];
    const roots = projectMediaRoots({
      ...baseEnv,
      activeProjectFolder: '/projects/Song.apc',
      ensureDir: dir => made.push(dir),
    });
    expect(roots.writableRoot).toBe('/projects/Song.apc/assets');
    expect(made).toEqual(expect.arrayContaining([
      '/projects/Song.apc/assets/recordings',
      '/projects/Song.apc/assets/imports',
      '/projects/Song.apc/assets/spectrograms',
    ]));
  });

  it('falls back to the app-wide writable root for an unsaved project', () => {
    expect(projectMediaRoots({...baseEnv, activeProjectFolder: null}).writableRoot)
      .toBe('/userData/assets');
  });

  it('keeps the sample library app-wide REGARDLESS of the open project (the entanglement guard)', () => {
    const withProject = appWideAssetRoots({...baseEnv, activeProjectFolder: '/projects/Song.apc'});
    const unsaved = appWideAssetRoots({...baseEnv, activeProjectFolder: null});
    expect(withProject.writableRoot).toBe('/userData/assets');
    expect(unsaved.writableRoot).toBe('/userData/assets');
  });

  it('creates the sample-library dir under the app-wide root, not the project', () => {
    const made: string[] = [];
    appWideAssetRoots({
      ...baseEnv,
      activeProjectFolder: '/projects/Song.apc',
      ensureDir: dir => made.push(dir),
    });
    expect(made).toContain('/userData/assets/sample-library');
    expect(made.every(dir => !dir.startsWith('/projects/'))).toBe(true);
  });

  it('uses the bundled resources path for readRoot only when packaged', () => {
    expect(projectMediaRoots({...baseEnv, isPackaged: true}).readRoot).toBe('/res/assets');
    expect(projectMediaRoots({...baseEnv, isPackaged: false}).readRoot).toBe('/app/assets');
  });
});
