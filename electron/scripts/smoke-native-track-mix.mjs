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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-track-mix-'));
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

  const setTracks = send('setTracks', {
    tracks: [
      {
        id: 'track-1',
        name: 'Lead',
        type: 'software_instrument',
        instrumentId: 'synth_lead',
        presetId: 'pop_lead',
        isMuted: false,
        isSolo: true,
        isRecordArmed: false,
        isFrozen: true,
        trackFolderName: 'Verse',
        trackGroupName: 'Keys',
        volumeDb: -9,
        pan: -0.25,
        gainDb: 3,
        effectiveVolumeDb: -6,
        automationMode: 'touch',
        routingRole: 'bus',
        routingOutputTrackId: 'track-2',
        routingSends: [{targetTrackId: 'track-2', gainDb: 99, preFader: true}],
        routingSidechainSourceTrackId: 'track-2',
        automationLanes: [
          {
            id: 'vol',
            targetType: 'track',
            parameterId: 'volumeDb',
            points: [{beat: 0, value: -9}, {beat: 8, value: -3}],
          },
          {
            id: 'pan',
            targetType: 'track',
            parameterId: 'pan',
            points: [{beat: 0, value: -0.25}, {beat: 8, value: -0.25}],
          },
          {
            id: 'filter',
            targetType: 'instrument',
            parameterId: 'filter.cutoff',
            points: [{beat: 4, value: 0.5}],
          },
          {
            id: 'resonance',
            targetType: 'instrument',
            parameterId: 'filter.resonance',
            points: [{beat: 4, value: 0.32}],
          },
        ],
      },
      {
        id: 'track-2',
        name: 'Bus Clamp',
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_clean',
        isMuted: true,
        isSolo: false,
        isRecordArmed: false,
        volumeDb: 99,
        pan: 4,
        gainDb: 99,
        effectiveVolumeDb: 99,
        automationMode: 'not-a-mode',
        routingRole: 'not-a-role',
        automationLanes: [{id: 'pan', targetType: 'track', parameterId: 'pan', points: []}],
      },
    ],
  });
  assert.equal(setTracks.ok, true);
  assertClose(setTracks.data.tracks[0].effectiveVolumeDb, -6);
  assert.equal(setTracks.data.tracks[0].isFrozen, true);
  assert.equal(setTracks.data.tracks[0].trackFolderName, 'Verse');
  assert.equal(setTracks.data.tracks[0].trackGroupName, 'Keys');
  assert.equal(setTracks.data.tracks[0].automationMode, 'touch');
  assert.equal(setTracks.data.tracks[0].automationLaneCount, 4);
  assert.equal(setTracks.data.tracks[0].routingRole, 'bus');
  assert.equal(setTracks.data.tracks[0].routingOutputTrackId, 'track-2');
  assert.equal(setTracks.data.tracks[0].routingSendCount, 1);
  assert.equal(setTracks.data.tracks[0].routingSends[0].targetTrackId, 'track-2');
  assertClose(setTracks.data.tracks[0].routingSends[0].gainDb, 6);
  assert.equal(setTracks.data.tracks[0].routingSends[0].preFader, true);
  assert.equal(setTracks.data.tracks[0].routingSidechainSourceTrackId, 'track-2');
  assertClose(setTracks.data.tracks[1].volumeDb, 6);
  assertClose(setTracks.data.tracks[1].pan, 1);
  assertClose(setTracks.data.tracks[1].gainDb, 24);
  assertClose(setTracks.data.tracks[1].effectiveVolumeDb, 12);
  assert.equal(setTracks.data.tracks[1].automationMode, 'read');
  assert.equal(setTracks.data.tracks[1].automationLaneCount, 1);
  assert.equal(setTracks.data.tracks[1].routingRole, 'track');

  const assigned = send('assign_track_instrument', {
    trackId: 'track-1',
    instrument: 'four_osc',
    presetId: 'pop_lead',
  });
  assert.equal(assigned.ok, true);

  const master = send('set_master_mix', {volumeDb: -11, pan: 0.4});
  assert.equal(master.ok, true);

  const positioned = send('set_transport_position', {positionBeat: 4});
  assert.equal(positioned.ok, true);
  assertClose(positioned.data.positionBeat, 4);

  const mix = send('get_track_mix', {});
  assert.equal(mix.ok, true);
  assert.equal(mix.data.channelStripVersion, 6);
  assert.equal(mix.data.gainStageMode, 'separate_gain_trim');
  assertClose(mix.data.automationEvaluationBeat, 4);
  assert.equal(mix.data.tracks.length, 2);
  assert.equal(mix.data.tracks[0].id, 'track-1');
  assert.equal(mix.data.tracks[0].automationMode, 'touch');
  assert.equal(mix.data.tracks[0].automationReadActive, true);
  assert.equal(mix.data.tracks[0].isFrozen, true);
  assert.equal(mix.data.tracks[0].trackFolderName, 'Verse');
  assert.equal(mix.data.tracks[0].trackGroupName, 'Keys');
  assert.equal(mix.data.tracks[0].automationLaneCount, 4);
  assertClose(mix.data.tracks[0].automationEvaluationBeat, 4);
  assert.equal(mix.data.tracks[0].automationLanes.length, 4);
  assert.equal(mix.data.tracks[0].automationLanes[0].targetType, 'track');
  assert.equal(mix.data.tracks[0].automationLanes[0].parameterId, 'volumeDb');
  assert.equal(mix.data.tracks[0].automationLanes[0].pointCount, 2);
  assertClose(mix.data.tracks[0].automationLanes[0].evaluatedValue, -6);
  assert.equal(mix.data.tracks[0].automationLanes[1].parameterId, 'pan');
  assert.equal(mix.data.tracks[0].automationLanes[1].pointCount, 2);
  assertClose(mix.data.tracks[0].automationLanes[1].evaluatedValue, -0.25);
  assert.equal(mix.data.tracks[0].automationLanes[2].targetType, 'instrument');
  assertClose(mix.data.tracks[0].automationLanes[2].evaluatedValue, 0.5);
  assert.equal(mix.data.tracks[0].automationLanes[3].parameterId, 'filter.resonance');
  assertClose(mix.data.tracks[0].automationLanes[3].evaluatedValue, 0.32);
  assertClose(mix.data.tracks[0].automationAppliedFaderDb, -6);
  assertClose(mix.data.tracks[0].automationAppliedPan, -0.25);
  assert.equal(mix.data.tracks[0].nativeAutomationCurveCount, 4);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves.length, 4);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[0].parameterId, 'volumeDb');
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[0].pointCount, 2);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[0].bypassed, false);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[0].firstBeat, 0);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[0].lastBeat, 8);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[0].firstValue, -9);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[0].lastValue, -3);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[1].parameterId, 'pan');
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[1].pointCount, 2);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[1].firstValue, -0.25);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[1].lastValue, -0.25);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[2].parameterId, 'filter.cutoff');
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[2].pointCount, 1);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[2].firstBeat, 4);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[2].firstValue, 0.5);
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[3].parameterId, 'filter.resonance');
  assert.equal(mix.data.tracks[0].nativeAutomationCurves[3].pointCount, 1);
  assertClose(mix.data.tracks[0].nativeAutomationCurves[3].firstValue, 0.32);
  assert.equal(mix.data.tracks[0].routingRole, 'bus');
  assert.equal(mix.data.tracks[0].routingOutputTrackId, 'track-2');
  assert.equal(mix.data.tracks[0].routingSendCount, 1);
  assertClose(mix.data.tracks[0].routingSends[0].gainDb, 6);
  assert.equal(mix.data.tracks[0].routingSidechainSourceTrackId, 'track-2');
  assert.equal(mix.data.tracks[0].nativeSidechainPluginCount, 0);
  assert.deepEqual(mix.data.tracks[0].nativeSidechainPlugins, []);
  assertClose(mix.data.tracks[0].volumeDb, -9);
  assertClose(mix.data.tracks[0].gainDb, 3);
  assertClose(mix.data.tracks[0].nativeGainTrimDb, 3);
  assertClose(mix.data.tracks[0].nativeFaderDb, -6);
  assertClose(mix.data.tracks[0].nativeEffectiveVolumeDb, -3);
  assertClose(mix.data.tracks[0].channelStrip.inputGainDb, 3);
  assertClose(mix.data.tracks[0].channelStrip.faderVolumeDb, -6);
  assertClose(mix.data.tracks[0].channelStrip.pan, -0.25);
  assertClose(mix.data.tracks[0].channelStrip.postFaderEffectiveDb, -3);
  assertClose(mix.data.tracks[1].volumeDb, 6);
  assert.equal(mix.data.tracks[1].automationMode, 'read');
  assert.equal(mix.data.tracks[1].automationReadActive, false);
  assert.equal(mix.data.tracks[1].automationLaneCount, 1);
  assert.equal(mix.data.tracks[1].nativeAutomationCurveCount, 0);
  assert.equal(mix.data.tracks[1].routingRole, 'track');
  assertClose(mix.data.tracks[1].pan, 1);
  assertClose(mix.data.tracks[1].gainDb, 24);
  assertClose(mix.data.tracks[1].nativeGainTrimDb, 24);
  assertClose(mix.data.tracks[1].nativeFaderDb, 6);
  assertClose(mix.data.tracks[1].nativeEffectiveVolumeDb, 12);
  assertClose(mix.data.tracks[1].channelStrip.postFaderEffectiveDb, 12);
  assertClose(mix.data.master.volumeDb, -11);
  assertClose(mix.data.master.pan, 0.4);

  const capture = send('capture_track_automation', {
    trackId: 'track-1',
    targetType: 'track',
    parameterId: 'volumeDb',
    beat: 6,
  });
  assert.equal(capture.ok, true);
  assert.equal(capture.data.trackId, 'track-1');
  assert.equal(capture.data.targetType, 'track');
  assert.equal(capture.data.parameterId, 'volumeDb');
  assertClose(capture.data.beat, 6);
  assertClose(capture.data.value, -6);
  assert.equal(capture.data.lane.pointCount, 3);
  assert.deepEqual(capture.data.lane.points.map(point => point.beat), [0, 6, 8]);

  const capturedMix = send('get_track_mix', {trackId: 'track-1', beat: 6});
  assert.equal(capturedMix.ok, true);
  assert.equal(capturedMix.data.tracks[0].automationLaneCount, 4);
  const capturedLane = capturedMix.data.tracks[0].automationLanes.find(
    lane => lane.targetType === 'track' && lane.parameterId === 'volumeDb',
  );
  assert.equal(capturedLane.pointCount, 3);
  assertClose(capturedLane.evaluatedValue, -6);
  assert.equal(capturedMix.data.tracks[0].nativeAutomationCurves[0].pointCount, 3);

  const filtered = send('get_track_mix', {trackId: 'track-1'});
  assert.equal(filtered.ok, true);
  assert.equal(filtered.data.tracks.length, 1);
  assert.equal(filtered.data.tracks[0].id, 'track-1');

  const missing = send('get_track_mix', {trackId: 'missing'});
  assert.equal(missing.ok, false);
  assert.equal(missing.error.code, 'track_not_found');

  const readCapture = send('capture_track_automation', {
    trackId: 'track-2',
    targetType: 'track',
    parameterId: 'pan',
  });
  assert.equal(readCapture.ok, false);
  assert.equal(readCapture.error.code, 'automation_write_disabled');

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
      `native track mix smoke failed: status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`,
    );
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
