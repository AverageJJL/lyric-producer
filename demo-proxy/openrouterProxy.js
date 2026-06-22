const DEFAULT_ALLOWED_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-nano',
  'openai/gpt-4.1-mini',
];
const DEFAULT_PUBLIC_TOKEN = 'apc-public-demo';
const DEFAULT_OPENROUTER_URL = 'https://openrouter.ai/api/v1';
const DAY_MS = 24 * 60 * 60 * 1000;
const buckets = new Map();

function cleanString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function numberEnv(env, name, fallback) {
  const parsed = Number(env[name]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function csv(value) {
  return cleanString(value)?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
}

function bodyObject(req) {
  if (typeof req.body === 'string') {
    return JSON.parse(req.body);
  }
  return req.body && typeof req.body === 'object' ? req.body : {};
}

function bodyBytes(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function bearer(req) {
  const header = cleanString(req.headers?.authorization);
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? cleanString(req.headers?.['x-demo-token']);
}

function clientIp(req) {
  const forwarded = cleanString(req.headers?.['x-forwarded-for']);
  return forwarded?.split(',')[0]?.trim() ?? req.socket?.remoteAddress ?? 'unknown';
}

function consumeBucket(key, limit) {
  if (!Number.isFinite(limit) || limit <= 0) return true;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, {count: 1, resetAt: now + DAY_MS});
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  return true;
}

function allowedModels(env) {
  const configured = csv(env.DEMO_ALLOWED_MODELS);
  return new Set(configured.length ? configured : DEFAULT_ALLOWED_MODELS);
}

function sanitizedChatBody(body, env) {
  const allowed = allowedModels(env);
  const forcedModel = cleanString(env.DEMO_FORCE_MODEL);
  const requestedModel = cleanString(body.model);
  const model = forcedModel ?? requestedModel;
  if (!model || !allowed.has(model)) {
    return {ok: false, status: 400, error: 'Requested model is not allowed for the public demo.'};
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return {ok: false, status: 400, error: 'Missing chat messages.'};
  }
  if (body.stream === true) {
    return {ok: false, status: 400, error: 'Streaming is disabled for the public demo.'};
  }
  const maxTokens = numberEnv(env, 'DEMO_MAX_TOKENS', 4096);
  const forwarded = {
    ...body,
    model,
    stream: false,
    max_tokens: Math.min(Number(body.max_tokens) || maxTokens, maxTokens),
  };
  delete forwarded.plugins;
  return {ok: true, body: forwarded};
}

function setCors(req, res, env) {
  res.setHeader('Access-Control-Allow-Origin', cleanString(env.DEMO_ALLOWED_ORIGIN) ?? '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-demo-token');
  res.setHeader('Vary', 'Origin');
}

function json(res, status, payload) {
  res.status(status).json(payload);
}

async function handleOpenRouterProxy(req, res, env = process.env, fetchImpl = fetch) {
  setCors(req, res, env);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    json(res, 405, {error: {message: 'Method not allowed.'}});
    return;
  }
  const acceptedToken = cleanString(env.DEMO_PROXY_TOKEN) ?? DEFAULT_PUBLIC_TOKEN;
  if (bearer(req) !== acceptedToken) {
    json(res, 401, {error: {message: 'Invalid public demo token.'}});
    return;
  }
  const openRouterKey = cleanString(env.OPENROUTER_API_KEY);
  if (!openRouterKey) {
    json(res, 500, {error: {message: 'Demo proxy is missing OPENROUTER_API_KEY.'}});
    return;
  }

  let body;
  try {
    body = bodyObject(req);
  } catch {
    json(res, 400, {error: {message: 'Invalid JSON body.'}});
    return;
  }
  if (bodyBytes(body) > numberEnv(env, 'DEMO_MAX_BODY_BYTES', 750000)) {
    json(res, 413, {error: {message: 'Demo request is too large.'}});
    return;
  }
  const perIp = numberEnv(env, 'DEMO_MAX_REQUESTS_PER_IP_PER_DAY', 20);
  const total = numberEnv(env, 'DEMO_MAX_TOTAL_REQUESTS_PER_DAY', 200);
  const day = new Date().toISOString().slice(0, 10);
  if (!consumeBucket(`ip:${day}:${clientIp(req)}`, perIp) || !consumeBucket(`total:${day}`, total)) {
    json(res, 429, {error: {message: 'Public demo rate limit reached.'}});
    return;
  }
  const sanitized = sanitizedChatBody(body, env);
  if (!sanitized.ok) {
    json(res, sanitized.status, {error: {message: sanitized.error}});
    return;
  }

  const upstreamBase = cleanString(env.OPENROUTER_BASE_URL) ?? DEFAULT_OPENROUTER_URL;
  const upstream = await fetchImpl(`${upstreamBase.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${openRouterKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': cleanString(env.DEMO_OPENROUTER_REFERER) ?? '',
      'X-Title': 'AI Producer Core Public Demo',
    },
    body: JSON.stringify(sanitized.body),
  });
  const responseText = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'application/json');
  res.send(responseText);
}

module.exports = {
  DEFAULT_ALLOWED_MODELS,
  buckets,
  handleOpenRouterProxy,
  sanitizedChatBody,
};
