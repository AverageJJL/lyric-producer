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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-command-matrix-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};
const observed = new Set();

function parse(raw) {
  return JSON.parse(raw);
}

function sendRaw(command, payloadJson, expectedCommand = command) {
  observed.add(command);
  const response = parse(addon.sendCommand(command, payloadJson));
  assert.equal(response.command, expectedCommand, command);
  assert.equal(typeof response.ok, 'boolean', command);
  return response;
}

function send(command, payload = {}, expectedCommand = command) {
  return sendRaw(command, JSON.stringify(payload), expectedCommand);
}

function expectOk(response) {
  assert.equal(response.ok, true, response.command);
  assert.ok(response.data && typeof response.data === 'object', response.command);
  return response.data;
}

function expectError(response, code) {
  assert.equal(response.ok, false, response.command);
  assert.equal(response.error.code, code, response.command);
}

function expectOkOrDeviceUnavailable(response) {
  if (response.ok) {
    return;
  }
  assert.equal(response.error.code, 'audio_device_unavailable', response.command);
}

function assertClose(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 0.001, actual + ' != ' + expected);
}

const tracks = [
  {
    id: 'track-1',
    name: 'Lead',
    type: 'software_instrument',
    instrumentId: 'synth_lead',
    presetId: 'pop_lead',
    isMuted: false,
    isSolo: false,
    isRecordArmed: true,
    automationMode: 'touch',
    volumeDb: -5,
    pan: 0.2,
    gainDb: 2,
    effectiveVolumeDb: -3,
  },
  {
    id: 'track-2',
    name: 'Voice',
    type: 'voice_audio',
    instrumentId: 'voice_audio',
    presetId: 'voice_clean',
    isMuted: false,
    isSolo: false,
    isRecordArmed: true,
    isInputMonitoringEnabled: true,
  },
];

try {
  const init = parse(addon.initEngine(assetRoot, writableRoot));
  observed.add('engine_init');
  observed.add('set_asset_root');
  assert.equal(init.ok, true);
  assert.equal(init.command, 'set_asset_root');

  expectOk(send('engine_init'));
  const assetData = expectOk(send('set_asset_root', {root: assetRoot, writableRoot}));
  assert.equal(assetData.assetRoot, assetRoot);
  assert.equal(assetData.writableAssetRoot, writableRoot);

  const initialStatus = expectOk(send('engine_status'));
  assert.equal(initialStatus.engineInitialized, true);
  assert.equal(initialStatus.hasEdit, true);
  expectOk(send('engine_status_fast'));

  expectOk(send('set_bpm', {bpm: 128}));
  expectOk(send('setBpm', {bpm: 112}, 'set_bpm'));
  expectOk(send('set_click_track', {enabled: false}));
  expectOkOrDeviceUnavailable(send('start_count_in_click', {beats: 4, recordStartBeat: 0}));
  expectOk(send('stop_count_in_click'));
  expectOk(send('set_tempo_map', {
    bpm: 112,
    timeSignature: {numerator: 4, denominator: 4},
    tempoMap: [{id: 'tempo-8', beat: 8, bpm: 96, ramp: 'jump'}],
    meterMap: [{id: 'meter-8', beat: 8, timeSignature: {numerator: 7, denominator: 8}}],
  }));
  const tempoMap = expectOk(send('get_tempo_map'));
  assert.equal(tempoMap.tempoMap.length, 2);
  assert.equal(tempoMap.meterMap.length, 2);

  const positioned = expectOk(send('set_transport_position', {positionBeat: 2}));
  assertClose(positioned.positionBeat, 2);
  expectOk(send('transport_stop'));
  expectOk(send('return_to_zero'));
  expectOk(send('returnToZero', {}, 'return_to_zero'));
  expectOk(send('set_loop_range', {startBeat: 4, lengthBeats: 8, looping: true}));

  const setTracks = expectOk(send('setTracks', {tracks}));
  assert.equal(setTracks.tracks.length, 2);
  const setTracksAlias = expectOk(send('set_tracks', {tracks}, 'setTracks'));
  assert.equal(setTracksAlias.uiTrackCount, 2);

  expectOk(send('set_record_arm', {trackId: 'track-1', armed: true}));
  expectOk(send('assign_track_instrument', {
    trackId: 'track-1',
    instrument: 'four_osc',
    presetId: 'pop_lead',
  }));
  const presets = expectOk(send('list_instrument_presets', {instrumentId: 'four_osc'}));
  assert.ok(presets.presets.some(preset => preset.id === 'pop_lead'));
  expectOk(send('set_track_preset', {trackId: 'track-1', presetId: 'warm_pad'}));
  const param = expectOk(send('set_track_instrument_param', {
    trackId: 'track-1',
    parameterId: 'filter.cutoff',
    value: 0.44,
  }));
  assertClose(param.value, 0.44);

  expectOk(send('upsert_midi_clip', {
    clipId: 'clip-midi',
    trackId: 'track-1',
    startBeat: 0,
    lengthBeats: 4,
    notes: [{note: 60, velocity: 96, startBeat: 0, lengthBeats: 1}],
  }));
  expectOk(send('upsert_audio_clip', {
    clipId: 'clip-empty-audio',
    trackId: 'track-2',
    startBeat: 0,
    lengthBeats: 4,
  }));
  expectOk(send('delete_clip', {clipId: 'clip-midi'}));

  expectOk(send('set_master_mix', {volumeDb: -9, pan: -0.25}));
  const mix = expectOk(send('get_track_mix', {trackId: 'track-1', beat: 2}));
  assert.equal(mix.tracks.length, 1);
  assert.equal(mix.tracks[0].id, 'track-1');
  const routingGraph = expectOk(send('get_routing_graph'));
  assert.equal(routingGraph.routingGraphVersion, 1);
  assert.equal(routingGraph.trackCount, 2);
  assert.equal(routingGraph.hasRoutingIssues, false);
  const capture = expectOk(send('capture_track_automation', {
    trackId: 'track-1',
    targetType: 'track',
    parameterId: 'volumeDb',
    beat: 2,
  }));
  assert.equal(capture.lane.pointCount, 1);

  expectOk(send('set_track_fx', {
    trackId: 'track-1',
    slots: [
      {slot: 'eq', enabled: true, params: {bands: [{freq: 900, q: 0.8, gain: -2}]}},
      {slot: 'compressor', enabled: true, params: {threshold: -18, ratio: 4, attack: 12, release: 120}},
      {slot: 'reverb', enabled: true, params: {size: 0.65, mix: 0.24, preDelay: 45}},
    ],
  }));
  const fx = expectOk(send('get_track_fx', {trackId: 'track-1'}));
  assert.equal(fx.slots.length, 3);
  const fxCatalog = expectOk(send('list_fx_plugins'));
  assert.ok(fxCatalog.plugins.some(plugin => plugin.pluginId === 'airwindows:Parametric'));
  const pluginScanRoot = path.join(writableRoot, 'plugin-scan');
  fs.mkdirSync(path.join(pluginScanRoot, 'Nested', 'Shape.vst3'), {recursive: true});
  fs.mkdirSync(path.join(pluginScanRoot, 'Tone.component'), {recursive: true});
  process.env.MUSICAPP_FX_PLUGIN_PATHS = [pluginScanRoot, path.join(writableRoot, 'missing-plugins')].join(path.delimiter);
  const pluginScan = expectOk(send('scan_fx_plugins', {formats: ['external_vst3', 'external_au']}));
  assert.equal(pluginScan.externalPluginHosting, 'scan_metadata_only');
  assert.equal(pluginScan.defaultPathsUsed, true);
  assert.equal(pluginScan.formatCounts.external_vst3, 1);
  assert.equal(pluginScan.formatCounts.external_au, 1);
  assert.equal(pluginScan.scannedPaths[0].status, 'scanned');
  assert.equal(pluginScan.scannedPaths[1].status, 'missing');
  const scannedNames = pluginScan.candidates.map(candidate => candidate.displayName).sort();
  assert.deepEqual(scannedNames, ['Shape', 'Tone']);
  const insertValidation = expectOk(send('validate_fx_plugin_insert', {trackId: 'track-1', slot: 'eq', candidate: pluginScan.candidates[0]}));
  assert.equal(insertValidation.canInsert, false);
  assert.equal(insertValidation.reason, 'external_plugin_hosting_disabled');
  expectError(send('probe_fx_plugin', {format: 'external_vst3', path: path.join(pluginScanRoot, 'Nested', 'Shape.vst3')}), 'external_plugin_hosting_disabled');
  expectOk(send('set_amp_sim', {
    trackId: 'track-2',
    enabled: true,
    pedals: [{id: 'drive', type: 'overdrive', enabled: true, params: {drive: 0.6}}],
    cabinet: {enabled: true, irId: 'guitar_uk_4x12', mix: 0.5},
  }));
  expectOk(send('get_amp_sim', {trackId: 'track-2'}));

  expectOk(send('start_recording', {trackId: 'track-1', clipId: 'clip-record', startBeat: 0}));
  const recording = expectOk(send('stop_recording'));
  assert.equal(recording.clipId, 'clip-record');
  const audioStop = expectOk(send('stop_audio_recording'));
  assert.equal(typeof audioStop.nativeInputLatencyMs, 'number');

  const devices = expectOk(send('list_audio_devices'));
  assert.ok(Array.isArray(devices.outputs));
  assert.ok(Array.isArray(devices.inputs));
  expectOk(send('set_input_device', {name: ''}));
  expectOk(send('release_mic_capture'));

  expectOkOrDeviceUnavailable(send('refresh_audio_device', {forceReopen: true}));
  expectOkOrDeviceUnavailable(send('transport_play', {isPlaying: false}, 'transport_play'));
  expectOkOrDeviceUnavailable(send('setPlaybackState', {isPlaying: false}, 'transport_play'));
  expectOkOrDeviceUnavailable(send('midi_note_on', {trackId: 'track-1', note: 60, velocity: 90}));
  expectOk(send('midi_note_off', {trackId: 'track-1', note: 60}));
  expectOk(send('midi_all_notes_off', {trackId: 'track-1'}));
  expectOkOrDeviceUnavailable(send('start_midi_phrase_preview', {
    trackId: 'track-1',
    lengthBeats: 4,
    notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
  }));
  expectOkOrDeviceUnavailable(send('start_midi_phrase_preview', {
    trackId: 'track-1',
    lengthBeats: 4,
    notes: [{note: 64, velocity: 88, startBeat: 1, lengthBeats: 1}],
  }));
  expectOk(send('stop_midi_phrase_preview'));
  expectOk(send('stop_pattern_preview'));

  expectError(sendRaw('set_bpm', '{'), 'invalid_payload');
  expectError(send('set_audio_device_settings', {sampleRate: -1}), 'invalid_payload');
  expectError(send('set_output_device', {}), 'invalid_payload');
  expectError(send('render_mixdown', {}), 'invalid_payload');
  expectError(send('render_mixdown_async', {}), 'invalid_payload');
  expectError(send('cancel_render_mixdown', {}), 'invalid_payload');
  expectError(send('get_render_mixdown_status', {}), 'invalid_payload');
  expectError(send('analyze_audio_file', {}), 'invalid_payload');
  expectError(send('detect_audio_transients', {}), 'invalid_payload');
  expectError(send('start_audio_recording', {trackId: 'track-2'}), 'invalid_payload');
  expectError(send('render_spectrogram', {}), 'invalid_payload');
  expectError(send('unknown_native_command', {}), 'unknown_command');
  const required = [
    'engine_init', 'engine_status', 'engine_status_fast', 'set_asset_root', 'set_bpm', 'setBpm',
    'set_click_track', 'start_count_in_click', 'stop_count_in_click', 'set_tempo_map', 'get_tempo_map', 'set_transport_position',
    'transport_stop', 'return_to_zero', 'returnToZero', 'set_loop_range', 'setTracks',
    'set_tracks', 'set_record_arm', 'assign_track_instrument', 'list_instrument_presets',
    'set_track_preset', 'set_track_instrument_param', 'upsert_midi_clip', 'upsert_audio_clip',
    'delete_clip', 'set_master_mix', 'get_track_mix', 'get_routing_graph', 'capture_track_automation', 'set_track_fx', 'get_track_fx',
    'list_fx_plugins', 'scan_fx_plugins', 'validate_fx_plugin_insert', 'probe_fx_plugin', 'set_amp_sim', 'get_amp_sim', 'start_recording', 'stop_recording',
    'start_audio_recording', 'stop_audio_recording', 'list_audio_devices',
    'set_input_device', 'set_output_device', 'set_audio_device_settings',
    'release_mic_capture', 'refresh_audio_device', 'transport_play',
    'setPlaybackState', 'midi_note_on', 'midi_note_off', 'midi_all_notes_off',
    'start_midi_phrase_preview', 'stop_midi_phrase_preview', 'stop_pattern_preview',
    'render_mixdown', 'render_mixdown_async',
    'cancel_render_mixdown', 'get_render_mixdown_status', 'analyze_audio_file',
    'detect_audio_transients', 'render_spectrogram', 'unknown_native_command',
  ];
  for (const command of required) {
    assert.ok(observed.has(command), command + ' was not exercised');
  }
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
  if (result.status !== 0) {
    console.error(
      `native command matrix smoke failed: status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`,
    );
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
