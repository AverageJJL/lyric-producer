import {spawnSync} from 'node:child_process';
import {existsSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const addonPath = path.join(
  repoRoot,
  'electron/native/build-release/Release/native_audio_engine.node',
);

if (!existsSync(addonPath)) {
  throw new Error(`Native addon missing. Run npm run build:engine first: ${addonPath}`);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-master-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};
const rangeMixPath = ${JSON.stringify(path.join(tempRoot, 'range-mix.wav'))};

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.001, actual + ' != ' + expected);
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);

  const devices = send('list_audio_devices', {});
  assert.equal(devices.ok, true);
  assert.ok(Array.isArray(devices.data.inputs));
  const deviceStatus = send('engine_status', {});
  assert.equal(deviceStatus.ok, true);
  assert.ok(Array.isArray(deviceStatus.data.availableSampleRates));
  assert.ok(Array.isArray(deviceStatus.data.availableBufferSizes));
  assert.equal(typeof deviceStatus.data.inputLatencyMs, 'number');
  assert.equal(typeof deviceStatus.data.outputLatencyMs, 'number');
  const invalidDeviceSettings = send('set_audio_device_settings', {sampleRate: -1});
  assert.equal(invalidDeviceSettings.ok, false);
  assert.equal(invalidDeviceSettings.error.code, 'invalid_payload');
  const invalidRender = send('render_mixdown', {});
  assert.equal(invalidRender.ok, false);
  assert.equal(invalidRender.error.code, 'invalid_payload');
  const invalidRangeRender = send('render_mixdown', {
    path: rangeMixPath,
    startBeat: 4,
    endBeat: 4,
  });
  assert.equal(invalidRangeRender.ok, false);
  assert.equal(invalidRangeRender.error.code, 'invalid_payload');
  const invalidTailRender = send('render_mixdown', {
    path: rangeMixPath,
    startBeat: 0,
    endBeat: 1,
    tailBeats: -1,
  });
  assert.equal(invalidTailRender.ok, false);
  assert.equal(invalidTailRender.error.code, 'invalid_payload');
  const missingStemRender = send('render_mixdown', {
    path: rangeMixPath,
    trackId: '__missing_track__',
  });
  assert.equal(missingStemRender.ok, false);
  assert.equal(missingStemRender.error.code, 'track_not_found');
  const automaticInput = send('set_input_device', {name: ''});
  assert.equal(automaticInput.ok, true);
  assert.equal(automaticInput.data.preferredInputDeviceName, '');
  const missingInput = send('set_input_device', {name: '__missing_input_device__'});
  assert.equal(missingInput.ok, false);
  assert.equal(missingInput.error.code, 'input_unavailable');

  const setMaster = send('set_master_mix', {volumeDb: -12.5, pan: 0.35});
  assert.equal(setMaster.ok, true);
  assertClose(setMaster.data.masterVolumeDb, -12.5);
  assertClose(setMaster.data.masterPan, 0.35);

  const refreshed = send('refresh_audio_device', {forceReopen: true});
  assert.equal(refreshed.ok, true);
  assertClose(refreshed.data.masterVolumeDb, -12.5);
  assertClose(refreshed.data.masterPan, 0.35);

  const transport = send('transport_play', {
    isPlaying: false,
    positionBeat: 0,
    positionSeconds: 0,
  });
  assert.equal(transport.ok, true);
  assertClose(transport.data.masterVolumeDb, -12.5);
  assertClose(transport.data.masterPan, 0.35);

  const invalid = send('set_master_mix', {volumeDb: 99, pan: -4});
  assert.equal(invalid.ok, true);
  assertClose(invalid.data.masterVolumeDb, 6);
  assertClose(invalid.data.masterPan, -1);

  addon.shutdownEngine();
  process.exit(0);
} catch (error) {
  try { addon.shutdownEngine(); } catch {}
  console.error(error);
  process.exit(1);
}
`;

try {
  writeFileSync(smokeMainPath, smokeMain);
  const result = spawnSync(electronPath, [smokeMainPath], {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(
      `native master smoke failed: status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`,
    );
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
