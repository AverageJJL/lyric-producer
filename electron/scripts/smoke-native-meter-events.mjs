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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-meter-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};
const events = [];

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

function shutdownAndExit(code) {
  try { addon.shutdownEngine(); } catch {}
  process.exit(code);
}

try {
  addon.setEventCallback((eventName, payloadJson) => {
    if (eventName === 'onMixMeterUpdate') {
      events.push(parse(payloadJson));
    }
  });

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
    }],
  }).ok, true);

  setTimeout(() => {
    try {
      const event = events.find(item => item.schemaVersion === 1 && item.tracks?.length === 1);
      assert.ok(event, 'expected onMixMeterUpdate with one track');
      assert.equal(event.source, 'tracktion_level_measurer');
      assert.equal(event.input.active, false);
      assert.equal(event.input.clipping, false);
      assert.equal(event.master.clipping, false);
      assert.equal(event.tracks[0].trackId, 'track-1');
      assert.ok(Array.isArray(event.tracks[0].channels));
      shutdownAndExit(0);
    } catch (error) {
      console.error(error);
      shutdownAndExit(1);
    }
  }, 350);
} catch (error) {
  console.error(error);
  shutdownAndExit(1);
}
`;

try {
  writeFileSync(smokeMainPath, smokeMain);
  const result = spawnSync(electronPath, [smokeMainPath], {stdio: 'inherit'});
  if (result.status !== 0) {
    console.error(
      `native meter event smoke failed: status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`,
    );
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
