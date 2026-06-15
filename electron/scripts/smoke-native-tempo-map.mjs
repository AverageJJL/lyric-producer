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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-tempo-map-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload = {}) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);

  const setMap = send('set_tempo_map', {
    bpm: 120,
    timeSignature: {numerator: 4, denominator: 4},
    tempoMap: [
      {id: 'tempo-eight', beat: 8, bpm: 132, ramp: 'linear'},
      {id: 'tempo-sixteen', beat: 16, bpm: 96, ramp: 'jump'},
    ],
    meterMap: [
      {id: 'meter-eight', beat: 8, timeSignature: {numerator: 7, denominator: 8}},
    ],
  });
  assert.equal(setMap.ok, true);
  assert.equal(setMap.data.bpm, 120);
  assert.equal(setMap.data.tempoMap.length, 3);
  assert.equal(setMap.data.tempoMap[1].beat, 8);
  assert.equal(setMap.data.tempoMap[1].bpm, 132);
  assert.equal(setMap.data.tempoMap[1].ramp, 'linear');
  assert.equal(setMap.data.tempoMap[2].ramp, 'jump');
  assert.equal(setMap.data.meterMap.length, 2);
  assert.deepEqual(setMap.data.meterMap[1].timeSignature, {numerator: 7, denominator: 8});

  const readMap = send('get_tempo_map');
  assert.equal(readMap.ok, true);
  assert.deepEqual(readMap.data.tempoMap, setMap.data.tempoMap);
  assert.deepEqual(readMap.data.meterMap, setMap.data.meterMap);

  const status = send('engine_status');
  assert.equal(status.ok, true);
  assert.equal(status.data.bpm, 120);

  const slowdownMap = send('set_tempo_map', {
    bpm: 120,
    timeSignature: {numerator: 4, denominator: 4},
    tempoMap: [
      {id: 'tempo-four', beat: 4, bpm: 60, ramp: 'jump'},
    ],
    meterMap: [],
  });
  assert.equal(slowdownMap.ok, true);

  const positioned = send('set_transport_position', {positionBeat: 8});
  assert.equal(positioned.ok, true);
  assert.ok(Math.abs(positioned.data.positionBeat - 8) < 0.001);
  assert.ok(positioned.data.positionSeconds > 5.9);

  const bad = send('set_tempo_map', {tempoMap: []});
  assert.equal(bad.ok, false);
  assert.equal(bad.error.code, 'invalid_payload');

  addon.shutdownEngine();
} catch (error) {
  try { addon.shutdownEngine(); } catch {}
  throw error;
}
`;

writeFileSync(smokeMainPath, smokeMain);

try {
  const result = spawnSync(electronPath, [smokeMainPath], {
    cwd: repoRoot,
    env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`Native tempo-map smoke failed with exit code ${result.status}`);
  }
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
