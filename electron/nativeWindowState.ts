import * as fs from 'node:fs';
import * as path from 'node:path';
import type {BrowserWindow, Display, Rectangle} from 'electron';

export const MAIN_WINDOW_STATE_FILE = 'main-window-state.json';

export type NativeWindowBounds = Pick<Rectangle, 'x' | 'y' | 'width' | 'height'>;

export const DEFAULT_MAIN_WINDOW_BOUNDS = {
  width: 1440,
  height: 920,
};

function statePath(userDataPath: string): string {
  return path.join(userDataPath, MAIN_WINDOW_STATE_FILE);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function coerceBounds(value: unknown): NativeWindowBounds | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const maybeBounds = value as Partial<NativeWindowBounds>;
  if (
    !isFiniteNumber(maybeBounds.x)
    || !isFiniteNumber(maybeBounds.y)
    || !isFiniteNumber(maybeBounds.width)
    || !isFiniteNumber(maybeBounds.height)
    || maybeBounds.width <= 0
    || maybeBounds.height <= 0
  ) {
    return null;
  }
  return {
    x: Math.round(maybeBounds.x),
    y: Math.round(maybeBounds.y),
    width: Math.round(maybeBounds.width),
    height: Math.round(maybeBounds.height),
  };
}

export function workAreasFromDisplays(displays: Array<Pick<Display, 'workArea'>>): NativeWindowBounds[] {
  return displays.map(display => display.workArea);
}

export function boundsIntersectWorkAreas(
  bounds: NativeWindowBounds,
  workAreas: NativeWindowBounds[],
): boolean {
  return workAreas.some(area => (
    bounds.x < area.x + area.width
    && bounds.x + bounds.width > area.x
    && bounds.y < area.y + area.height
    && bounds.y + bounds.height > area.y
  ));
}

export function savedBoundsFromJson(
  parsedJson: unknown,
  workAreas: NativeWindowBounds[],
): NativeWindowBounds | null {
  const root = parsedJson && typeof parsedJson === 'object'
    ? parsedJson as {bounds?: unknown}
    : null;
  const bounds = coerceBounds(root?.bounds);
  if (!bounds || !boundsIntersectWorkAreas(bounds, workAreas)) {
    return null;
  }
  return bounds;
}

export function readMainWindowBounds(
  userDataPath: string,
  workAreas: NativeWindowBounds[],
): NativeWindowBounds | null {
  try {
    return savedBoundsFromJson(
      JSON.parse(fs.readFileSync(statePath(userDataPath), 'utf8')),
      workAreas,
    );
  } catch {
    return null;
  }
}

export function writeMainWindowBounds(
  userDataPath: string,
  bounds: NativeWindowBounds,
): void {
  fs.mkdirSync(userDataPath, {recursive: true});
  fs.writeFileSync(
    statePath(userDataPath),
    JSON.stringify({bounds}, null, 2),
    'utf8',
  );
}

export function installMainWindowStatePersistence(
  window: BrowserWindow,
  userDataPath: string,
): void {
  window.on('close', () => {
    const bounds = window.isMinimized() ? window.getNormalBounds() : window.getBounds();
    writeMainWindowBounds(userDataPath, bounds);
  });
}
