import {
  installPermissionPolicy,
  isTrustedAppOrigin,
  shouldGrantPermission,
} from '../electron/permissionPolicy';
import {validatePermissionPromptQa} from '../electron/permissionQa';

describe('Electron permission policy', () => {
  it('trusts only packaged file URLs and local dev origins', () => {
    expect(isTrustedAppOrigin('file://')).toBe(true);
    expect(isTrustedAppOrigin('file:///Applications/AI Producer Core.app')).toBe(true);
    expect(isTrustedAppOrigin('http://localhost:5173')).toBe(true);
    expect(isTrustedAppOrigin('http://127.0.0.1:5173')).toBe(true);
    expect(isTrustedAppOrigin('https://example.com')).toBe(false);
    expect(isTrustedAppOrigin('not a url')).toBe(false);
  });

  it('allows only benign app permissions from trusted origins', () => {
    expect(shouldGrantPermission('fullscreen', 'file://')).toBe(true);
    expect(shouldGrantPermission('clipboard-sanitized-write', 'http://localhost:5173')).toBe(true);
    expect(shouldGrantPermission('media', 'file://')).toBe(false);
    expect(shouldGrantPermission('display-capture', 'file://')).toBe(false);
    expect(shouldGrantPermission('notifications', 'file://')).toBe(false);
    expect(shouldGrantPermission('fullscreen', 'https://example.com')).toBe(false);
  });

  it('installs deny-by-default handlers on the Electron session', () => {
    const targetSession = {
      setDisplayMediaRequestHandler: jest.fn(),
      setPermissionCheckHandler: jest.fn(),
      setPermissionRequestHandler: jest.fn(),
    };
    installPermissionPolicy(targetSession);

    const checkHandler = targetSession.setPermissionCheckHandler.mock.calls[0][0];
    expect(checkHandler(null, 'fullscreen', 'file://', {})).toBe(true);
    expect(checkHandler(null, 'media', 'file://', {})).toBe(false);

    const requestHandler = targetSession.setPermissionRequestHandler.mock.calls[0][0];
    const callback = jest.fn();
    requestHandler({}, 'fullscreen', callback, {requestingOrigin: 'file://'});
    expect(callback).toHaveBeenCalledWith(true);

    const mediaCallback = jest.fn();
    requestHandler({}, 'media', mediaCallback, {requestingOrigin: 'file://'});
    expect(mediaCallback).toHaveBeenCalledWith(false);

    const displayHandler = targetSession.setDisplayMediaRequestHandler.mock.calls[0][0];
    const displayCallback = jest.fn();
    displayHandler({}, displayCallback);
    expect(displayCallback).toHaveBeenCalledWith({});
  });

  it('passes the release permission prompt QA matrix', () => {
    const result = validatePermissionPromptQa();

    expect(result.failures).toEqual([]);
    expect(result.passed).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.stringContaining('renderer mic capture denied session request'),
      expect.stringContaining('renderer display capture denied session request'),
      expect.stringContaining('display capture handler returns empty source map'),
    ]));
  });
});
