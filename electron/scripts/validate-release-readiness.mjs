import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const packagePath = path.join(repoRoot, 'package.json');
const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'));

const strict = process.argv.includes('--strict') || process.env.RELEASE_PREFLIGHT_STRICT === '1';

function absolute(relativePath) {
  return path.join(repoRoot, relativePath);
}
function hasRequiredEnv(keys) {
  return keys.every(key => Boolean(process.env[key]));
}
function hasMacSigningInput() {
  return hasRequiredEnv(['CSC_LINK', 'CSC_KEY_PASSWORD']) || Boolean(process.env.CSC_NAME);
}
function hasNotarizationInput() {
  return hasRequiredEnv(['APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER'])
    || hasRequiredEnv(['APPLE_ID', 'APPLE_APP_SPECIFIC_PASSWORD', 'APPLE_TEAM_ID'])
    || Boolean(process.env.APPLE_KEYCHAIN_PROFILE);
}
function hasAzureSigningAuth() {
  const hasRequiredIdentity = hasRequiredEnv(['AZURE_TENANT_ID', 'AZURE_CLIENT_ID']);
  return hasRequiredIdentity
    && (Boolean(process.env.AZURE_CLIENT_SECRET)
      || Boolean(process.env.AZURE_CLIENT_CERTIFICATE_PATH)
      || hasRequiredEnv(['AZURE_USERNAME', 'AZURE_PASSWORD']));
}
function hasWindowsAzureSigningInput(win) {
  const azure = win.azureSignOptions;
  return Boolean(
    azure?.publisherName
      && azure.endpoint
      && azure.certificateProfileName
      && azure.codeSigningAccountName
      && hasAzureSigningAuth(),
  );
}
function hasWindowsSigntoolInput(win) {
  const signtool = win.signtoolOptions ?? {};
  return Boolean(
    signtool.sign
      || signtool.certificateFile
      || signtool.certificateSubjectName
      || signtool.certificateSha1
      || process.env.WIN_CSC_LINK
      || process.env.CSC_LINK,
  );
}
function hasWindowsSigningInput(win) {
  return hasWindowsSigntoolInput(win) || hasWindowsAzureSigningInput(win);
}
function hasCrashUploadEndpoint() {
  const rawUrl = process.env.AI_PRODUCER_CRASH_UPLOAD_URL?.trim();
  if (!rawUrl) {
    return false;
  }
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
function hasRuntimeUpdaterDependency() {
  return Boolean(packageJson.dependencies?.['electron-updater']);
}
function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
function publishConfigs(build) {
  if (!build.publish) {
    return [];
  }
  return Array.isArray(build.publish) ? build.publish : [build.publish];
}
function updatePublishConfig(build) {
  return publishConfigs(build).find(config => config?.provider === 'generic');
}
function updateFeedUrl(config) {
  if (config?.url === '${env.AI_PRODUCER_UPDATE_FEED_URL}') {
    return process.env.AI_PRODUCER_UPDATE_FEED_URL?.trim();
  }
  return typeof config?.url === 'string' ? config.url.trim() : undefined;
}
function warnOrFail(errors, warnings, message) {
  if (strict) {
    errors.push(message);
    return;
  }
  warnings.push(message);
}
function warnPath(errors, warnings, relativePath, hint) {
  if (existsSync(absolute(relativePath))) {
    return;
  }
  warnOrFail(errors, warnings, `${hint}: ${absolute(relativePath)}`);
}
function readEntitlements(errors, relativePath, label) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    errors.push(`${label} entitlement path must be configured.`);
    return '';
  }
  const entitlementPath = absolute(relativePath);
  if (!existsSync(entitlementPath)) {
    errors.push(`${label} entitlement file missing: ${entitlementPath}`);
    return '';
  }
  return readFileSync(entitlementPath, 'utf8');
}
function hasTrueEntitlement(contents, key) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`<key>${escapedKey}</key>\\s*<true\\s*/>`).test(contents);
}
function requireEntitlement(errors, contents, key, label) {
  if (!hasTrueEntitlement(contents, key)) {
    errors.push(`${label} entitlements must enable ${key}.`);
  }
}
function targetIncludes(target, expected) {
  if (typeof target === 'string') {
    return target === expected;
  }
  if (Array.isArray(target)) {
    return target.some(item => targetIncludes(item, expected));
  }
  return Boolean(target && typeof target === 'object' && target.target === expected);
}
function assertReleaseReadiness() {
  const errors = [];
  const warnings = [];
  const build = packageJson.build ?? {};
  const mac = build.mac ?? {};
  const win = build.win ?? {};
  const scripts = packageJson.scripts ?? {};

  if (!scripts['validate:macos'] || !scripts['validate:release'] || !scripts['validate:release-services'] || !scripts['validate:release-artifacts'] || !scripts.dist) {
    errors.push('Missing validate:macos, validate:release, validate:release-services, validate:release-artifacts, or dist package script.');
  }
  if (mac.identity === null) {
    errors.push('macOS identity must not be null because null disables code signing.');
  }
  if (mac.hardenedRuntime !== true) {
    errors.push('macOS hardened runtime must be enabled for Developer ID releases.');
  }
  if (mac.gatekeeperAssess !== false) {
    errors.push('macOS gatekeeperAssess must stay false so notarization handles release trust.');
  }
  if (mac.notarize === false) {
    errors.push('macOS notarization must not be disabled.');
  }
  if (!mac.extendInfo?.NSMicrophoneUsageDescription) {
    errors.push('macOS Info.plist must describe microphone recording permission.');
  }

  const mainEntitlements = readEntitlements(errors, mac.entitlements, 'Main');
  const childEntitlements = readEntitlements(errors, mac.entitlementsInherit, 'Inherited');
  for (const key of [
    'com.apple.security.cs.allow-jit',
    'com.apple.security.cs.allow-unsigned-executable-memory',
    'com.apple.security.cs.disable-library-validation',
  ]) {
    requireEntitlement(errors, mainEntitlements, key, 'Main');
    requireEntitlement(errors, childEntitlements, key, 'Inherited');
  }
  requireEntitlement(errors, mainEntitlements, 'com.apple.security.device.audio-input', 'Main');

  if (!targetIncludes(win.target, 'nsis')) {
    errors.push('Windows release target must include nsis.');
  }
  if (win.verifyUpdateCodeSignature !== true) {
    errors.push('Windows update signature verification must stay enabled.');
  }
  if (win.signAndEditExecutable !== true) {
    errors.push('Windows executable signing/metadata editing must stay enabled.');
  }
  if (win.requestedExecutionLevel !== 'asInvoker') {
    errors.push('Windows requested execution level must remain asInvoker.');
  }
  const hashes = win.signtoolOptions?.signingHashAlgorithms;
  if (!Array.isArray(hashes) || hashes.length !== 1 || hashes[0] !== 'sha256') {
    errors.push('Windows signtool signingHashAlgorithms must be sha256-only.');
  }
  if (!win.signtoolOptions?.rfc3161TimeStampServer) {
    errors.push('Windows signtool must use an RFC 3161 timestamp server.');
  }

  const publish = updatePublishConfig(build);
  if (!publish) {
    errors.push('Release builds must configure a generic update feed publisher.');
  } else {
    if (publish.url !== '${env.AI_PRODUCER_UPDATE_FEED_URL}' && !isHttpsUrl(publish.url)) {
      errors.push('Generic update feed publisher must use the AI_PRODUCER_UPDATE_FEED_URL env macro or an HTTPS URL.');
    }
    if (publish.channel !== 'latest') {
      errors.push('Generic update feed publisher must default to the latest channel.');
    }
    if (publish.publishAutoUpdate === false) {
      errors.push('Generic update feed publisher must publish auto-update metadata.');
    }
  }
  if (build.electronUpdaterCompatibility !== '>=2.16') {
    errors.push('Electron Builder updater metadata compatibility must stay >=2.16.');
  }
  if (build.detectUpdateChannel !== true) {
    errors.push('Electron Builder must keep update channel detection enabled.');
  }
  if (build.generateUpdatesFilesForAllChannels !== true) {
    errors.push('Electron Builder must generate update metadata for all channels.');
  }

  if (!hasMacSigningInput()) {
    warnOrFail(
      errors,
      warnings,
      'macOS signing credentials are not exported; set CSC_LINK+CSC_KEY_PASSWORD or CSC_NAME for release.',
    );
  }
  if (!hasNotarizationInput()) {
    warnOrFail(
      errors,
      warnings,
      'Apple notarization credentials are not exported; set API-key, Apple-ID, or keychain-profile variables.',
    );
  }
  if (!hasWindowsSigningInput(win)) {
    warnOrFail(
      errors,
      warnings,
      'Windows signing credentials are not exported; set WIN_CSC_LINK/CSC_LINK or configure Azure Trusted Signing for release.',
    );
  }
  if (!hasCrashUploadEndpoint()) {
    warnOrFail(
      errors,
      warnings,
      'Crash upload endpoint is not exported; set AI_PRODUCER_CRASH_UPLOAD_URL for release crash reporting.',
    );
  }
  if (!isHttpsUrl(updateFeedUrl(publish))) {
    warnOrFail(
      errors,
      warnings,
      'Update feed URL is not exported; set AI_PRODUCER_UPDATE_FEED_URL to an HTTPS feed base URL for release metadata.',
    );
  }
  if (!hasRuntimeUpdaterDependency()) {
    warnOrFail(
      errors,
      warnings,
      'Runtime updater dependency is not installed; add electron-updater before enabling automatic update checks.',
    );
  }

  // Strict mode checks build inputs as well as credentials because it is meant
  // for the last local/CI gate before running electron-builder distribution.
  for (const [relativePath, hint] of [
    ['dist-electron/main.js', 'Built Electron main missing; run npm run build'],
    ['dist-electron/preload.js', 'Built Electron preload missing; run npm run build'],
    ['dist/renderer/index.html', 'Built renderer missing; run npm run build'],
    [
      'electron/native/build-release/Release/native_audio_engine.node',
      'Native addon missing; run npm run build:engine',
    ],
  ]) {
    warnPath(errors, warnings, relativePath, hint);
  }

  return {errors, warnings};
}

const {errors, warnings} = assertReleaseReadiness();
if (warnings.length > 0) {
  console.warn(warnings.map(warning => `WARN ${warning}`).join('\n'));
}
if (errors.length > 0) {
  console.error(['Release readiness preflight failed:', ...errors.map(error => `- ${error}`)].join('\n'));
  process.exit(1);
}

console.log(`Release readiness preflight passed${strict ? ' in strict mode' : ''}.`);
