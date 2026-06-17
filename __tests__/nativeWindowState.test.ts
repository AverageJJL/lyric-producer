import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  boundsIntersectWorkAreas,
  readMainWindowBounds,
  savedBoundsFromJson,
  writeMainWindowBounds,
} from '../electron/nativeWindowState';

const workAreas = [{x: 0, y: 0, width: 1440, height: 900}];

describe('native window state', () => {
  it('accepts saved bounds that intersect an available work area', () => {
    const bounds = {x: 100, y: 80, width: 1200, height: 760};

    expect(boundsIntersectWorkAreas(bounds, workAreas)).toBe(true);
    expect(savedBoundsFromJson({bounds}, workAreas)).toEqual(bounds);
  });

  it('rejects malformed or offscreen saved bounds', () => {
    expect(savedBoundsFromJson({bounds: {x: 10, y: 10, width: 0, height: 700}}, workAreas))
      .toBeNull();
    expect(savedBoundsFromJson({bounds: {x: 5000, y: 5000, width: 900, height: 700}}, workAreas))
      .toBeNull();
  });

  it('roundtrips persisted main-window bounds from userData', () => {
    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'musicapp-window-state-'));
    const bounds = {x: 12, y: 24, width: 1100, height: 760};

    try {
      writeMainWindowBounds(userData, bounds);
      expect(readMainWindowBounds(userData, workAreas)).toEqual(bounds);
    } finally {
      fs.rmSync(userData, {recursive: true, force: true});
    }
  });
});
