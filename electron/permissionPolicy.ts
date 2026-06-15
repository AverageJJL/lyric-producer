import type {Session} from 'electron';

type Permission =
  | 'clipboard-read'
  | 'clipboard-sanitized-write'
  | 'display-capture'
  | 'fullscreen'
  | 'geolocation'
  | 'idle-detection'
  | 'keyboardLock'
  | 'media'
  | 'mediaKeySystem'
  | 'midi'
  | 'midiSysex'
  | 'notifications'
  | 'openExternal'
  | 'pointerLock'
  | 'serial'
  | 'speaker-selection'
  | 'storage-access'
  | 'top-level-storage-access'
  | 'usb'
  | 'window-management'
  | 'fileSystem'
  | 'unknown';

const benignAppPermissions = new Set<Permission>([
  'clipboard-sanitized-write',
  'fullscreen',
]);

export function isTrustedAppOrigin(origin: string): boolean {
  if (!origin || origin === 'file://') {
    return true;
  }
  try {
    const url = new URL(origin);
    return url.protocol === 'file:'
      || (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname));
  } catch {
    return false;
  }
}

export function shouldGrantPermission(permission: Permission, origin: string): boolean {
  return benignAppPermissions.has(permission) && isTrustedAppOrigin(origin);
}

export function installPermissionPolicy(targetSession: Pick<
  Session,
  'setDisplayMediaRequestHandler' | 'setPermissionCheckHandler' | 'setPermissionRequestHandler'
>) {
  targetSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => (
    shouldGrantPermission(permission as Permission, requestingOrigin)
  ));
  targetSession.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    const value = 'requestingOrigin' in details ? details.requestingOrigin : '';
    const origin = typeof value === 'string' ? value : '';
    callback(origin.length > 0 && shouldGrantPermission(permission as Permission, origin));
  });
  targetSession.setDisplayMediaRequestHandler((_request, callback) => callback({}));
}
