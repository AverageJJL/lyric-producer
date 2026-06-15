import {createCollaborationServicePolicy} from './collaboration-service-policy.mjs';

function endpointFromEnv(env) {
  return String(env.AI_PRODUCER_COLLAB_SERVICE_URL ?? env.COLLAB_SERVICE_URL ?? '').trim();
}

function healthUrlFor(endpoint) {
  const url = new URL(endpoint);
  if (url.protocol === 'ws:') {
    url.protocol = 'http:';
  }
  if (url.protocol === 'wss:') {
    url.protocol = 'https:';
  }
  url.pathname = '/health';
  url.search = '';
  return url;
}

async function readHealth(endpoint) {
  const response = await fetch(healthUrlFor(endpoint), {headers: {'cache-control': 'no-store'}});
  if (!response.ok) {
    throw new Error(`health returned HTTP ${response.status}`);
  }
  return response.json();
}

function requireHostedHealth(health, errors) {
  if (health?.ok !== true) {
    errors.push('Collaboration health response did not report ok=true.');
  }
  if (health?.tokenRequired !== true || health?.deployment?.tokenRequired !== true) {
    errors.push('Hosted collaboration health must report tokenRequired=true.');
  }
  if (health?.deployment?.hosted !== true) {
    errors.push('Hosted collaboration health must report deployment.hosted=true.');
  }
  if (health?.deployment?.originPolicy !== 'restricted') {
    errors.push('Hosted collaboration health must report a restricted origin policy.');
  }
}

async function main() {
  const strict = process.argv.includes('--strict') || process.env.CI_RELEASE_STRICT === '1';
  const policy = createCollaborationServicePolicy(process.env);
  const endpoint = endpointFromEnv(process.env);
  const errors = [...policy.errors];
  const warnings = [];

  if (!endpoint) {
    warnings.push('AI_PRODUCER_COLLAB_SERVICE_URL/COLLAB_SERVICE_URL is not set; hosted probe skipped.');
  } else {
    try {
      const health = await readHealth(endpoint);
      requireHostedHealth(health, errors);
    } catch (error) {
      errors.push(`Hosted collaboration health probe failed: ${error.message}`);
    }
  }

  if (strict) {
    errors.push(...warnings);
  }
  warnings.forEach(warning => console.warn(`WARN ${warning}`));
  if (errors.length > 0) {
    errors.forEach(error => console.error(`ERROR ${error}`));
    process.exitCode = 1;
    return;
  }
  console.log('Collaboration service readiness validation passed.');
}

await main();
