import {installPermissionPolicy, shouldGrantPermission} from './permissionPolicy';

type PermissionCase = {
  label: string;
  permission: string;
  origin: string;
  expected: boolean;
};

export type PermissionQaResult = {
  passed: boolean;
  checks: string[];
  failures: string[];
};

const PERMISSION_CASES: PermissionCase[] = [
  {
    label: 'packaged fullscreen',
    permission: 'fullscreen',
    origin: 'file://',
    expected: true,
  },
  {
    label: 'local dev clipboard write',
    permission: 'clipboard-sanitized-write',
    origin: 'http://localhost:5173',
    expected: true,
  },
  {
    label: 'renderer mic capture denied',
    permission: 'media',
    origin: 'file://',
    expected: false,
  },
  {
    label: 'renderer display capture denied',
    permission: 'display-capture',
    origin: 'file://',
    expected: false,
  },
  {
    label: 'external fullscreen denied',
    permission: 'fullscreen',
    origin: 'https://example.com',
    expected: false,
  },
  {
    label: 'usb denied',
    permission: 'usb',
    origin: 'file://',
    expected: false,
  },
  {
    label: 'notifications denied',
    permission: 'notifications',
    origin: 'file://',
    expected: false,
  },
];

function recordCheck(
  checks: string[],
  failures: string[],
  label: string,
  actual: unknown,
  expected: unknown,
): void {
  if (actual === expected) {
    checks.push(`${label}: ${String(actual)}`);
    return;
  }
  failures.push(`${label}: expected ${String(expected)}, got ${String(actual)}`);
}

function buildMockSession() {
  let checkHandler: ((webContents: unknown, permission: string, origin: string) => boolean) | null = null;
  let requestHandler: ((
    webContents: unknown,
    permission: string,
    callback: (granted: boolean) => void,
    details: {requestingOrigin?: string},
  ) => void) | null = null;
  let displayHandler: ((request: unknown, callback: (response: unknown) => void) => void) | null = null;

  const session = {
    setPermissionCheckHandler(handler: typeof checkHandler) {
      checkHandler = handler;
    },
    setPermissionRequestHandler(handler: typeof requestHandler) {
      requestHandler = handler;
    },
    setDisplayMediaRequestHandler(handler: typeof displayHandler) {
      displayHandler = handler;
    },
  };

  return {
    session,
    check(permission: string, origin: string) {
      return checkHandler?.({}, permission, origin);
    },
    request(permission: string, origin?: string) {
      let value: boolean | undefined;
      requestHandler?.({}, permission, granted => {
        value = granted;
      }, origin === undefined ? {} : {requestingOrigin: origin});
      return value;
    },
    displayCapture() {
      let value: unknown;
      displayHandler?.({}, response => {
        value = response;
      });
      return value;
    },
  };
}

export function validatePermissionPromptQa(): PermissionQaResult {
  const checks: string[] = [];
  const failures: string[] = [];
  const mock = buildMockSession();

  installPermissionPolicy(mock.session as Parameters<typeof installPermissionPolicy>[0]);

  PERMISSION_CASES.forEach(item => {
    recordCheck(
      checks,
      failures,
      `${item.label} direct policy`,
      shouldGrantPermission(item.permission as never, item.origin),
      item.expected,
    );
    recordCheck(
      checks,
      failures,
      `${item.label} session check`,
      mock.check(item.permission, item.origin),
      item.expected,
    );
    recordCheck(
      checks,
      failures,
      `${item.label} session request`,
      mock.request(item.permission, item.origin),
      item.expected,
    );
  });

  recordCheck(
    checks,
    failures,
    'missing requesting origin denies session request',
    mock.request('fullscreen'),
    false,
  );
  recordCheck(
    checks,
    failures,
    'display capture handler returns empty source map',
    JSON.stringify(mock.displayCapture()),
    '{}',
  );

  return {
    passed: failures.length === 0,
    checks,
    failures,
  };
}
