function csv(value) {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function positiveInt(value, fallback, minimum = 1) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed >= minimum ? parsed : fallback;
}

function normalizeOrigin(value) {
  const raw = String(value ?? '').trim();
  if (raw === 'file://' || raw === 'null') {
    return raw;
  }
  try {
    const url = new URL(raw);
    if (url.protocol === 'file:') {
      return 'file://';
    }
    if (url.protocol === 'app:') {
      return `${url.protocol}//${url.host}`;
    }
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.origin : '';
  } catch {
    return '';
  }
}

function hostedSafeOrigin(origin) {
  return origin.startsWith('https://') || origin === 'file://' || origin.startsWith('app://');
}

function deploymentMode(env) {
  return String(
    env.AI_PRODUCER_COLLAB_DEPLOYMENT_MODE ??
      env.COLLAB_DEPLOYMENT_MODE ??
      'local',
  ).trim().toLowerCase();
}

export function createCollaborationServicePolicy(env = process.env) {
  const mode = deploymentMode(env);
  const hosted = mode === 'hosted' || mode === 'production' || mode === 'prod';
  const allowedTokens = csv(env.COLLAB_TOKENS);
  const allowedOrigins = csv(env.COLLAB_ALLOWED_ORIGINS)
    .map(normalizeOrigin)
    .filter(Boolean);
  const allowInsecureOrigins = String(env.COLLAB_ALLOW_INSECURE_ORIGINS ?? '') === '1';
  const errors = [];

  // Hosted mode carries live studio operations between machines, so anonymous
  // or originless upgrades are treated as deployment misconfiguration.
  if (hosted && allowedTokens.length === 0) {
    errors.push('COLLAB_TOKENS must be configured in hosted collaboration mode.');
  }
  if (hosted && allowedOrigins.length === 0) {
    errors.push('COLLAB_ALLOWED_ORIGINS must be configured in hosted collaboration mode.');
  }
  if (hosted && !allowInsecureOrigins && allowedOrigins.some(origin => !hostedSafeOrigin(origin))) {
    errors.push('Hosted collaboration origins must be HTTPS, file://, or app:// unless COLLAB_ALLOW_INSECURE_ORIGINS=1.');
  }

  return {
    mode,
    hosted,
    tokenRequired: hosted || allowedTokens.length > 0,
    allowedTokens,
    allowedOrigins,
    maxRooms: positiveInt(env.COLLAB_MAX_ROOMS, 64),
    maxPeersPerRoom: positiveInt(env.COLLAB_MAX_PEERS_PER_ROOM, 16),
    maxOperationsPerRoom: positiveInt(env.COLLAB_MAX_OPERATIONS_PER_ROOM, 500),
    maxMessageBytes: positiveInt(env.COLLAB_MAX_MESSAGE_BYTES, 64 * 1024, 1024),
    maxMessagesPerMinute: positiveInt(env.COLLAB_MAX_MESSAGES_PER_MINUTE, 240),
    idleTimeoutMs: positiveInt(env.COLLAB_IDLE_TIMEOUT_MS, 120000, 1000),
    errors,
  };
}

export function tokenAllowed(token, policy) {
  if (!policy.tokenRequired) {
    return true;
  }
  return policy.allowedTokens.includes(String(token ?? '').trim());
}

export function originAllowed(origin, policy) {
  if (policy.allowedOrigins.length === 0) {
    return !policy.hosted;
  }
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && policy.allowedOrigins.includes(normalized));
}

export function securityHeaders(policy) {
  const headers = {
    'cache-control': 'no-store',
    'content-type': 'application/json',
    'permissions-policy': 'camera=(), microphone=(), display-capture=(), geolocation=(), usb=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  };
  if (policy.hosted) {
    headers['strict-transport-security'] = 'max-age=31536000';
  }
  return headers;
}

export function publicPolicy(policy) {
  return {
    mode: policy.mode,
    hosted: policy.hosted,
    tokenRequired: policy.tokenRequired,
    tokenCount: policy.allowedTokens.length,
    originPolicy: policy.allowedOrigins.length > 0 ? 'restricted' : 'local-open',
    allowedOrigins: policy.allowedOrigins,
    maxRooms: policy.maxRooms,
    maxPeersPerRoom: policy.maxPeersPerRoom,
    maxOperationsPerRoom: policy.maxOperationsPerRoom,
    maxMessageBytes: policy.maxMessageBytes,
    maxMessagesPerMinute: policy.maxMessagesPerMinute,
    idleTimeoutMs: policy.idleTimeoutMs,
  };
}
