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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-instrument-param-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

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
  assert.equal(send('setTracks', {
    tracks: [{
      id: 'track-1',
      name: 'Lead',
      type: 'software_instrument',
      instrumentId: 'synth_lead',
      presetId: 'pop_lead',
      isMuted: false,
      isSolo: false,
      isRecordArmed: false,
      automationMode: 'touch',
    }],
  }).ok, true);
  assert.equal(send('assign_track_instrument', {
    trackId: 'track-1',
    instrument: 'four_osc',
    presetId: 'pop_lead',
  }).ok, true);

  const setParam = send('set_track_instrument_param', {
    trackId: 'track-1',
    parameterId: 'filter.cutoff',
    value: 0.42,
  });
  assert.equal(setParam.ok, true);
  assertClose(setParam.data.value, 0.42);

  const capture = send('capture_track_automation', {
    trackId: 'track-1',
    targetType: 'instrument',
    parameterId: 'filter.cutoff',
    beat: 5,
  });
  assert.equal(capture.ok, true);
  assertClose(capture.data.value, 0.42);
  assert.equal(capture.data.lane.pointCount, 1);
  assertClose(capture.data.lane.points[0].beat, 5);

  const invalid = send('set_track_instrument_param', {
    trackId: 'track-1',
    parameterId: 'filter.unsupported',
    value: 0.5,
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'parameter_unavailable');

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
  const result = spawnSync(electronPath, [smokeMainPath], {
    env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
