const strict = process.argv.includes('--strict') || process.env.RELEASE_PREFLIGHT_STRICT === '1';
const allowHttp = process.env.RELEASE_SERVICE_ALLOW_HTTP === '1';

function warnOrFail(errors, warnings, message) {
  if (strict) {
    errors.push(message);
    return;
  }
  warnings.push(message);
}

function csv(value) {
  return String(value ?? '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function envUrl(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return '';
}

function isAllowedUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || (allowHttp && url.protocol === 'http:');
  } catch {
    return false;
  }
}

function feedManifestNames() {
  const explicit = csv(process.env.AI_PRODUCER_UPDATE_MANIFESTS);
  if (explicit.length > 0) {
    return explicit;
  }
  const channel = process.env.AI_PRODUCER_UPDATE_CHANNEL?.trim() || 'latest';
  return [`${channel}.yml`, `${channel}-mac.yml`];
}

function appendPath(baseUrl, childPath) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/$/, '')}/${childPath.replace(/^\//, '')}`;
  return url.toString();
}

async function fetchText(url) {
  const response = await fetch(url, {headers: {'cache-control': 'no-store'}});
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.text();
}

function looksLikeUpdaterManifest(text) {
  return /\bversion:\s*\S+/.test(text) && (/\bfiles:\s*$|^\s+-\s+url:/m.test(text) || /\bpath:\s*\S+/.test(text));
}

async function validateCrashIngestion(errors, warnings) {
  const uploadUrl = envUrl('AI_PRODUCER_CRASH_UPLOAD_URL');
  const healthUrl = envUrl('AI_PRODUCER_CRASH_HEALTH_URL', 'AI_PRODUCER_CRASH_UPLOAD_HEALTH_URL');
  if (!uploadUrl) {
    warnOrFail(errors, warnings, 'Crash upload endpoint is not exported; set AI_PRODUCER_CRASH_UPLOAD_URL.');
    return;
  }
  if (!isAllowedUrl(uploadUrl)) {
    errors.push('Crash upload endpoint must be HTTPS.');
  }
  if (!healthUrl) {
    warnOrFail(errors, warnings, 'Crash health endpoint is not exported; set AI_PRODUCER_CRASH_HEALTH_URL for hosted ingestion validation.');
    return;
  }
  if (!isAllowedUrl(healthUrl)) {
    errors.push('Crash health endpoint must be HTTPS.');
    return;
  }
  await fetchText(healthUrl);
}

async function validateUpdateFeed(errors, warnings) {
  const feedUrl = envUrl('AI_PRODUCER_UPDATE_FEED_URL');
  if (!feedUrl) {
    warnOrFail(errors, warnings, 'Update feed URL is not exported; set AI_PRODUCER_UPDATE_FEED_URL.');
    return;
  }
  if (!isAllowedUrl(feedUrl)) {
    errors.push('Update feed URL must be HTTPS.');
    return;
  }
  for (const manifest of feedManifestNames()) {
    const manifestUrl = appendPath(feedUrl, manifest);
    const text = await fetchText(manifestUrl);
    if (!looksLikeUpdaterManifest(text)) {
      errors.push(`Update feed manifest is not valid Electron updater metadata: ${manifestUrl}`);
    }
  }
}

async function main() {
  const errors = [];
  const warnings = [];
  try {
    await validateCrashIngestion(errors, warnings);
    await validateUpdateFeed(errors, warnings);
  } catch (error) {
    errors.push(`Hosted release service probe failed: ${error.message}`);
  }
  warnings.forEach(warning => console.warn(`WARN ${warning}`));
  if (errors.length > 0) {
    errors.forEach(error => console.error(`ERROR ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log(`Hosted release service validation passed${strict ? ' in strict mode' : ''}.`);
}

await main();
