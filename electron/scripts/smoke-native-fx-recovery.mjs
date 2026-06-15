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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-fx-recovery-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function parse(raw) { return JSON.parse(raw); }
function send(command, payload) { return parse(addon.sendCommand(command, JSON.stringify(payload))); }

const track = {
  id: 'track-1',
  name: 'Recovery Track',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
};

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  assert.equal(send('setTracks', {tracks: [track]}).ok, true);

  const recovered = send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {
        slot: 'eq',
        enabled: true,
        params: {pluginId: 'external:channel-strip', values: {dryWet: 0.75}},
      },
      {
        slot: 'compressor',
        enabled: true,
        params: {
          pluginId: 'airwindows:Logical4',
          values: {threshold: 0.5, ratio: 0.2, speed: 0.19, makeupGain: 0.5, dryWet: 1},
        },
      },
      {
        slot: 'reverb',
        enabled: true,
        params: {pluginId: 'airwindows:MatrixVerb', values: {roomSize: 0.5, dryWet: 0.4}},
      },
    ],
    pluginChain: [
      {
        slot: 'eq',
        pluginId: 'external:channel-strip',
        displayName: 'Channel Strip',
        format: 'external_vst3',
        enabled: true,
        bypassed: false,
        order: 0,
        status: 'available',
      },
      {
        slot: 'compressor',
        pluginId: 'airwindows:Parametric',
        displayName: 'Parametric',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: false,
        order: 1,
        status: 'available',
      },
      {
        slot: 'reverb',
        pluginId: 'airwindows:MatrixVerb',
        displayName: 'MatrixVerb',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: false,
        order: 2,
        status: 'available',
      },
    ],
  });

  assert.equal(recovered.ok, true);
  assert.equal(recovered.data.slots[0].params.pluginId, 'airwindows:Parametric');
  assert.deepEqual(recovered.data.nativePluginOrder, ['reverb']);
  assert.deepEqual(recovered.data.nativePluginBypass, {reverb: false});
  assert.deepEqual(recovered.data.pluginChain.map(slot => slot.slot), ['eq', 'compressor', 'reverb']);
  assert.equal(recovered.data.pluginChain[0].status, 'disabled');
  assert.equal(
    recovered.data.pluginChain[0].recoveryHint,
    'External VST3 plugin hosting is disabled in this build.',
  );
  assert.equal(recovered.data.pluginChain[1].status, 'missing');
  assert.equal(
    recovered.data.pluginChain[1].recoveryHint,
    'Only the built-in Logical4 processor can be hosted in this slot.',
  );
  assert.equal(recovered.data.pluginChain[2].status, 'available');

  const fx = send('get_track_fx', {trackId: 'track-1'});
  assert.equal(fx.ok, true);
  assert.deepEqual(fx.data.nativePluginOrder, ['reverb']);
  assert.deepEqual(fx.data.nativePluginBypass, {reverb: false});
  assert.equal(fx.data.pluginChain[0].status, 'disabled');
  assert.equal(fx.data.pluginChain[1].status, 'missing');

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
    stdio: 'inherit',
    env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
