import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const electronVersion = require('electron/package.json').version;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-external-plugin-host-'));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {stdio: 'inherit', ...options});
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

function findBundle(root, extension) {
  for (const entry of readdirSync(root)) {
    const candidate = path.join(root, entry);
    const stats = statSync(candidate);
    if (stats.isDirectory() && candidate.endsWith(extension)) {
      return candidate;
    }
    if (stats.isDirectory()) {
      const nested = findBundle(candidate, extension);
      if (nested) {
        return nested;
      }
    }
  }
  return null;
}

function buildFixturePlugin() {
  const buildDir = path.join(tempRoot, 'fixture-build');
  run('cmake', [
    '-S',
    path.join(repoRoot, 'tools/external-plugin-fixture'),
    '-B',
    buildDir,
    '-DCMAKE_BUILD_TYPE=Release',
  ]);
  run('cmake', ['--build', buildDir, '--config', 'Release', '--target', 'MusicAppExternalFixture_VST3']);
  const bundle = findBundle(buildDir, '.vst3');
  if (!bundle) {
    throw new Error('Fixture VST3 bundle was not produced.');
  }
  return bundle;
}

function buildHostEnabledAddon() {
  const buildDir = path.join(tempRoot, 'native-host-build');
  run('npx', [
    'cmake-js',
    'compile',
    '--directory',
    'electron/native',
    '--out',
    buildDir,
    '--runtime',
    'electron',
    '--runtime-version',
    electronVersion,
    '--config',
    'Release',
    '--CDMUSICAPP_ENABLE_EXTERNAL_PLUGIN_HOSTING=ON',
  ], {cwd: repoRoot});
  const addonPath = path.join(buildDir, 'Release/native_audio_engine.node');
  if (!existsSync(addonPath)) {
    throw new Error(`Host-enabled native addon missing: ${addonPath}`);
  }
  return addonPath;
}

function writeSmokeMain(addonPath, fixturePath) {
  const smokeMainPath = path.join(tempRoot, 'external-host-smoke.cjs');
  writeFileSync(smokeMainPath, `
const assert = require('node:assert/strict');
const path = require('node:path');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(path.join(tempRoot, 'runtime'))};
const fixturePath = ${JSON.stringify(fixturePath)};
const fixtureRoot = path.dirname(fixturePath);
const missingPath = path.join(writableRoot, 'MissingFixture.vst3');

function parse(raw) { return JSON.parse(raw); }
function send(command, payload = {}) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}
function expectOk(response) {
  assert.equal(response.ok, true, response.command);
  assert.ok(response.data && typeof response.data === 'object', response.command);
  return response.data;
}
function slotPayload(slot, enabled) {
  const ids = {
    eq: 'airwindows:Parametric',
    compressor: 'airwindows:Logical4',
    reverb: 'airwindows:MatrixVerb',
  };
  return {slot, enabled, params: {pluginId: ids[slot], values: {dryWet: 1}}};
}
function chainSlot(slot, overrides = {}) {
  const names = {eq: 'Parametric', compressor: 'Logical4', reverb: 'MatrixVerb'};
  const ids = {
    eq: 'airwindows:Parametric',
    compressor: 'airwindows:Logical4',
    reverb: 'airwindows:MatrixVerb',
  };
  return {
    slot,
    pluginId: ids[slot],
    displayName: names[slot],
    format: 'builtin_airwindows',
    enabled: false,
    bypassed: true,
    order: slot === 'eq' ? 0 : slot === 'compressor' ? 1 : 2,
    status: 'available',
    ...overrides,
  };
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  expectOk(send('setTracks', {tracks: [{
    id: 'track-1',
    name: 'External Host Track',
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isMuted: false,
    isSolo: false,
    isRecordArmed: false,
  }]}));

  const scan = expectOk(send('scan_fx_plugins', {
    paths: [fixtureRoot],
    formats: ['external_vst3'],
    recursive: true,
  }));
  assert.equal(scan.externalPluginHosting, 'enabled');
  const candidate = scan.candidates.find(item => item.path === fixturePath);
  assert.ok(candidate, 'fixture candidate not found');
  assert.equal(candidate.status, 'available');

  const probe = expectOk(send('probe_fx_plugin', {
    path: fixturePath,
    format: 'external_vst3',
    instantiate: true,
    sampleRate: 48000,
    blockSize: 256,
  }));
  assert.equal(probe.instantiated, true);
  assert.ok(probe.descriptionCount >= 1);
  assert.equal(probe.instance.name, 'MusicApp External Fixture');

  const validation = expectOk(send('validate_fx_plugin_insert', {
    trackId: 'track-1',
    slot: 'eq',
    candidate,
  }));
  assert.equal(validation.canInsert, true);
  assert.equal(validation.reason, 'ready');

  const externalEq = chainSlot('eq', {
    pluginId: candidate.pluginId,
    displayName: candidate.displayName,
    format: candidate.format,
    enabled: true,
    bypassed: false,
    status: 'available',
  });
  const insertPayload = {
    trackId: 'track-1',
    slots: [slotPayload('eq', true), slotPayload('compressor', false), slotPayload('reverb', false)],
    pluginChain: [externalEq, chainSlot('compressor'), chainSlot('reverb')],
  };
  const inserted = expectOk(send('set_track_fx', insertPayload));
  assert.deepEqual(inserted.nativePluginOrder, ['eq', 'compressor', 'reverb']);
  assert.deepEqual(inserted.nativePluginBypass, {eq: false, compressor: true, reverb: true});
  assert.equal(inserted.pluginChain[0].status, 'available');

  const bypassed = expectOk(send('set_track_fx', {
    ...insertPayload,
    pluginChain: [{...externalEq, bypassed: true}, chainSlot('compressor'), chainSlot('reverb')],
  }));
  assert.deepEqual(bypassed.nativePluginBypass, {eq: true, compressor: true, reverb: true});

  const reordered = expectOk(send('set_track_fx', {
    trackId: 'track-1',
    slots: [slotPayload('eq', true), slotPayload('compressor', false), slotPayload('reverb', true)],
    pluginChain: [
      chainSlot('reverb', {enabled: true, bypassed: false, order: 0}),
      {...externalEq, order: 1},
      chainSlot('compressor', {order: 2}),
    ],
  }));
  assert.deepEqual(reordered.nativePluginOrder, ['reverb', 'eq', 'compressor']);

  addon.shutdownEngine();
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  expectOk(send('setTracks', {tracks: [{id: 'track-1', name: 'Restored', type: 'software_instrument'}]}));
  const restored = expectOk(send('set_track_fx', insertPayload));
  assert.deepEqual(restored.nativePluginOrder, ['eq', 'compressor', 'reverb']);

  const missing = expectOk(send('set_track_fx', {
    trackId: 'track-1',
    slots: [slotPayload('eq', true), slotPayload('compressor', false), slotPayload('reverb', false)],
    pluginChain: [{
      ...externalEq,
      pluginId: 'external_vst3:' + missingPath,
      displayName: 'Missing Fixture',
    }, chainSlot('compressor'), chainSlot('reverb')],
  }));
  assert.deepEqual(missing.nativePluginOrder, ['compressor', 'reverb']);
  assert.equal(missing.pluginChain[0].status, 'missing');
  assert.match(missing.pluginChain[0].recoveryHint, /Re-scan or recover/);

  addon.shutdownEngine();
  process.exit(0);
} catch (error) {
  try { addon.shutdownEngine(); } catch {}
  console.error(error);
  process.exit(1);
}
`);
  return smokeMainPath;
}

try {
  const fixturePath = buildFixturePlugin();
  const addonPath = buildHostEnabledAddon();
  const smokeMainPath = writeSmokeMain(addonPath, fixturePath);
  run(electronPath, [smokeMainPath], {
    env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
  });
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
