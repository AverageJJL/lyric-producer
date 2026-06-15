import {existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const strict = process.argv.includes('--strict') || process.env.RELEASE_ARTIFACT_STRICT === '1';
function releaseDir() {
  return path.resolve(
    repoRoot,
    process.env.RELEASE_ARTIFACT_DIR ?? packageJson.build?.directories?.output ?? 'release',
  );
}

function collect(root, predicate, results = []) {
  if (!existsSync(root)) {
    return results;
  }
  for (const name of readdirSync(root)) {
    const item = path.join(root, name);
    const stats = statSync(item);
    if (predicate(item)) {
      results.push(item);
    }
    if (stats.isDirectory() && !item.endsWith('.app')) {
      collect(item, predicate, results);
    }
  }
  return results;
}

function run(command, args) {
  return spawnSync(command, args, {encoding: 'utf8'});
}

function warnOrFail(errors, warnings, message) {
  if (strict) {
    errors.push(message);
  } else {
    warnings.push(message);
  }
}

function hasUpdateMetadata(file) {
  const contents = readFileSync(file, 'utf8');
  return /sha512:\s*\S+/.test(contents) && /(path|url):\s*\S+/.test(contents);
}

function verifyMacApp(app, errors, warnings) {
  if (process.platform !== 'darwin') {
    warnOrFail(errors, warnings, `Cannot validate macOS signing/notarization on ${process.platform}: ${app}`);
    return;
  }
  const codesign = run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  if (codesign.status !== 0) {
    warnOrFail(errors, warnings, `macOS app codesign verification failed: ${app}\n${codesign.stderr || codesign.stdout}`);
  }
  const spctl = run('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  if (spctl.status !== 0) {
    warnOrFail(errors, warnings, `macOS app Gatekeeper assessment failed: ${app}\n${spctl.stderr || spctl.stdout}`);
  }
  const stapler = run('xcrun', ['stapler', 'validate', app]);
  if (stapler.status !== 0) {
    warnOrFail(errors, warnings, `macOS app notarization staple validation failed: ${app}\n${stapler.stderr || stapler.stdout}`);
  }
}

function verifyMacDiskImages(files, errors, warnings) {
  for (const file of files) {
    if (process.platform !== 'darwin') {
      warnOrFail(errors, warnings, `Cannot validate DMG notarization staple on ${process.platform}: ${file}`);
      continue;
    }
    const result = run('xcrun', ['stapler', 'validate', file]);
    if (result.status !== 0) {
      warnOrFail(errors, warnings, `DMG notarization staple validation failed: ${file}\n${result.stderr || result.stdout}`);
    }
  }
}

function verifyWindowsInstallers(files, errors, warnings) {
  for (const file of files) {
    if (process.platform !== 'win32') {
      warnOrFail(errors, warnings, `Cannot validate Windows Authenticode signature on ${process.platform}: ${file}`);
      continue;
    }
    const result = run('signtool', ['verify', '/pa', '/tw', '/v', file]);
    if (result.status !== 0) {
      warnOrFail(errors, warnings, `Windows installer signature verification failed: ${file}\n${result.stderr || result.stdout}`);
    }
  }
}

function assertReleaseArtifacts() {
  const errors = [];
  const warnings = [];
  const outputDir = releaseDir();
  const apps = collect(outputDir, file => file.endsWith('.app'));
  const dmgs = collect(outputDir, file => file.endsWith('.dmg'));
  const windowsInstallers = collect(outputDir, file => file.endsWith('.exe'));
  const updateMetadata = collect(outputDir, file => /^latest.*\.yml$/.test(path.basename(file)));

  if (!existsSync(outputDir)) {
    warnOrFail(errors, warnings, `Release artifact directory is missing: ${outputDir}`);
  }
  if (apps.length === 0 && dmgs.length === 0) {
    warnOrFail(errors, warnings, `No macOS .app or .dmg artifacts found under ${outputDir}`);
  }
  if (windowsInstallers.length === 0) {
    warnOrFail(errors, warnings, `No Windows installer artifacts found under ${outputDir}`);
  }
  if (updateMetadata.length === 0) {
    warnOrFail(errors, warnings, `No updater latest*.yml metadata found under ${outputDir}`);
  }

  for (const app of apps) {
    verifyMacApp(app, errors, warnings);
  }
  verifyMacDiskImages(dmgs, errors, warnings);
  verifyWindowsInstallers(windowsInstallers, errors, warnings);
  for (const file of updateMetadata) {
    if (!hasUpdateMetadata(file)) {
      warnOrFail(errors, warnings, `Updater metadata is missing sha512/path-or-url fields: ${file}`);
    }
  }
  return {errors, warnings};
}

if (process.env.RELEASE_ARTIFACT_SELFTEST === '1') {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), 'musicapp-release-artifacts-'));
  process.env.RELEASE_ARTIFACT_DIR = tempDir;
  try {
    const result = assertReleaseArtifacts();
    if (result.errors.length !== 0 || result.warnings.length !== 3) {
      throw new Error('release artifact selftest did not produce the expected warnings');
    }
  } finally {
    rmSync(tempDir, {recursive: true, force: true});
  }
  console.log('Release artifact validation selftest passed.');
  process.exit(0);
}

const {errors, warnings} = assertReleaseArtifacts();
if (warnings.length > 0) {
  console.warn(warnings.map(warning => `WARN ${warning}`).join('\n'));
}
if (errors.length > 0) {
  console.error(['Release artifact validation failed:', ...errors.map(error => `- ${error}`)].join('\n'));
  process.exit(1);
}

console.log(`Release artifact validation passed${strict ? ' in strict mode' : ''}.`);
