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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-fx-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function parse(raw) { return JSON.parse(raw); }

function send(command, payload) { return parse(addon.sendCommand(command, JSON.stringify(payload))); }

function assertCurve(mix, parameterId, firstValue, lastValue) {
  const curves = mix.data.tracks[0].nativeAutomationCurves;
  const curve = curves.find(entry => entry.parameterId === parameterId);
  assert.ok(curve, parameterId);
  assert.equal(curve.pointCount, 2);
  assert.equal(curve.bypassed, false);
  assert.equal(curve.firstBeat, 0);
  assert.equal(curve.lastBeat, 8);
  assert.ok(Math.abs(curve.firstValue - firstValue) < 0.0001);
  assert.ok(Math.abs(curve.lastValue - lastValue) < 0.0001);
}

const fxTrack = {
  id: 'track-1',
  name: 'FX Track',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  automationMode: 'touch',
  automationLanes: [
    {
      targetType: 'fx',
      parameterId: 'eq.dryWet',
      points: [{beat: 0, value: 0.25}, {beat: 8, value: 0.75}],
    },
    {
      targetType: 'fx',
      parameterId: 'compressor.threshold',
      points: [{beat: 0, value: 0.2}, {beat: 8, value: 0.8}],
    },
  ],
};

const inputTrack = {
  id: 'track-2',
  name: 'DI Guitar',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_clean',
  isRecordArmed: true,
  isInputMonitoringEnabled: true,
};

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  assert.equal(send('setTracks', {tracks: [fxTrack, inputTrack]}).ok, true);

  const pluginSet = send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {
        slot: 'eq',
        enabled: true,
        params: {
          pluginId: 'airwindows:Parametric',
          values: {treble: 0.55, dryWet: 1},
        },
      },
      {
        slot: 'compressor',
        enabled: true,
        params: {
          pluginId: 'airwindows:Logical4',
          values: {threshold: 0.45, ratio: 0.3, speed: 0.25, makeupGain: 0.5, dryWet: 1},
        },
      },
      {
        slot: 'reverb',
        enabled: true,
        params: {
          pluginId: 'airwindows:MatrixVerb',
          values: {roomSize: 0.65, dryWet: 0.24},
        },
      },
    ],
    pluginChain: [
      {
        slot: 'eq',
        pluginId: 'airwindows:Parametric',
        displayName: 'Parametric',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: false,
        order: 0,
        status: 'available',
      },
      {
        slot: 'reverb',
        pluginId: 'airwindows:MatrixVerb',
        displayName: 'MatrixVerb',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: false,
        order: 1,
        status: 'available',
      },
      {
        slot: 'compressor',
        pluginId: 'airwindows:Logical4',
        displayName: 'Logical4',
        format: 'builtin_airwindows',
        enabled: true,
        bypassed: true,
        order: 2,
        status: 'available',
      },
    ],
  });
  assert.equal(pluginSet.ok, true);
  assert.deepEqual(pluginSet.data.nativePluginOrder, ['eq', 'reverb', 'compressor']);
  assert.deepEqual(pluginSet.data.nativePluginBypass, {eq: false, reverb: false, compressor: true});
  const mix = send('get_track_mix', {trackId: 'track-1'});
  assert.equal(mix.ok, true);
  assertCurve(mix, 'eq.dryWet', 0.25, 0.75);
  assertCurve(mix, 'compressor.threshold', 0.2, 0.8);
  assert.equal(send('setTracks', {
    tracks: [{...fxTrack, automationMode: 'read', automationLanes: []}, inputTrack],
  }).ok, true);
  const clearedMix = send('get_track_mix', {trackId: 'track-1'});
  assert.equal(clearedMix.data.tracks[0].nativeAutomationCurveCount, 0);
  const fx = send('get_track_fx', {trackId: 'track-1'});
  assert.equal(fx.ok, true);
  assert.equal(fx.data.slots.length, 3);
  assert.equal(fx.data.slots[0].params.pluginId, 'airwindows:Parametric');
  assert.equal(fx.data.slots[0].params.values.treble, 0.55);
  assert.equal(fx.data.slots[1].params.pluginId, 'airwindows:Logical4');
  assert.equal(fx.data.slots[1].params.values.ratio, 0.3);
  assert.equal(fx.data.slots[2].params.pluginId, 'airwindows:MatrixVerb');
  assert.equal(fx.data.slots[2].params.values.roomSize, 0.65);
  assert.deepEqual(fx.data.pluginChain.map(slot => slot.slot), ['eq', 'reverb', 'compressor']);
  assert.deepEqual(fx.data.nativePluginOrder, ['eq', 'reverb', 'compressor']);
  assert.deepEqual(fx.data.nativePluginBypass, {eq: false, reverb: false, compressor: true});
  assert.equal(fx.data.pluginChain[1].displayName, 'MatrixVerb');
  const legacySet = send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {slot: 'eq', enabled: true, params: {bands: [{freq: 900, q: 0.8, gain: -2}]}},
      {slot: 'compressor', enabled: true, params: {
        threshold: -18,
        ratio: 4,
        attack: 12,
        release: 120,
      }},
      {slot: 'reverb', enabled: true, params: {size: 0.65, mix: 0.24, preDelay: 45}},
    ],
  });
  assert.equal(legacySet.ok, true);
  const legacyFx = send('get_track_fx', {trackId: 'track-1'});
  assert.equal(legacyFx.data.slots[0].params.pluginId, 'airwindows:Parametric');
  assert.equal(legacyFx.data.slots[1].params.pluginId, 'airwindows:Logical4');
  assert.equal(legacyFx.data.slots[2].params.values.roomSize, 0.65);
  assert.deepEqual(legacyFx.data.pluginChain.map(slot => slot.slot), ['eq', 'compressor', 'reverb']);
  assert.deepEqual(legacyFx.data.nativePluginOrder, ['eq', 'compressor', 'reverb']);
  assert.deepEqual(legacyFx.data.nativePluginBypass, {eq: false, compressor: false, reverb: false});
  const invalidChain = send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {
        slot: 'eq',
        enabled: false,
        params: {pluginId: 'airwindows:Parametric', values: {dryWet: 1}},
      },
      {
        slot: 'compressor',
        enabled: false,
        params: {
          pluginId: 'airwindows:Logical4',
          values: {threshold: 0.5, ratio: 0.2, speed: 0.19, makeupGain: 0.5, dryWet: 1},
        },
      },
      {
        slot: 'reverb',
        enabled: false,
        params: {pluginId: 'airwindows:MatrixVerb', values: {dryWet: 0.5}},
      },
    ],
    pluginChain: [{slot: 'not-a-slot', pluginId: 'bad'}],
  });
  assert.equal(invalidChain.ok, false);
  assert.equal(invalidChain.error.code, 'invalid_payload');

  const missingSlot = send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {
        slot: 'eq',
        enabled: false,
        params: {pluginId: 'airwindows:Parametric', values: {dryWet: 1}},
      },
      {
        slot: 'compressor',
        enabled: false,
        params: {
          pluginId: 'airwindows:Logical4',
          values: {threshold: 0.5, ratio: 0.2, speed: 0.19, makeupGain: 0.5, dryWet: 1},
        },
      },
    ],
  });
  assert.equal(missingSlot.ok, false);
  assert.equal(missingSlot.error.code, 'invalid_payload');

  const invalid = send('set_track_fx', {
    trackId: 'track-1',
    slots: [{slot: 'eq', enabled: true, params: {}}],
  });
  assert.equal(invalid.ok, false);
  assert.equal(invalid.error.code, 'invalid_payload');

  const missing = send('get_track_fx', {trackId: 'missing'});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'track_not_found');

  const ampSet = send('set_amp_sim', {
    trackId: 'track-2',
    enabled: true,
    inputMode: 'guitar_di',
    pedals: [
      {id: 'gate', type: 'noise_gate', enabled: true, params: {threshold: 0.2, floor: 0.04}},
      {id: 'drive', type: 'overdrive', enabled: true, params: {drive: 1.4, tone: 0.45, level: 0.8}},
    ],
    cabinet: {enabled: true, irId: 'guitar_uk_4x12', mix: 0.75},
  });
  assert.equal(ampSet.ok, true);
  assert.equal(ampSet.data.trackId, 'track-2');
  assert.equal(ampSet.data.monitoring, true);
  assert.equal(ampSet.data.lowLatencyMonitoring, true);
  assert.equal(ampSet.data.pedals[1].params.drive, 1);
  assert.equal(ampSet.data.cabinet.irId, 'guitar_uk_4x12');
  assert.equal(ampSet.data.cabinet.mix, 0.75);

  const amp = send('get_amp_sim', {trackId: 'track-2'});
  assert.equal(amp.ok, true);
  assert.equal(amp.data.enabled, true);
  assert.equal(amp.data.pedals.length, 2);

  const ampOnInstrument = send('set_amp_sim', {trackId: 'track-1', enabled: true});
  assert.equal(ampOnInstrument.ok, false);
  assert.equal(ampOnInstrument.error.code, 'unsupported_track');

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
