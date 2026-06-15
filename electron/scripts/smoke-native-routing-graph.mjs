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

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-routing-graph-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function parse(raw) {
  return JSON.parse(raw);
}

function sendRaw(command, payloadJson) {
  return parse(addon.sendCommand(command, payloadJson));
}

function send(command, payload = {}) {
  return sendRaw(command, JSON.stringify(payload));
}

function expectOk(response) {
  assert.equal(response.ok, true, response.command);
  return response.data;
}

function expectError(response, code) {
  assert.equal(response.ok, false, response.command);
  assert.equal(response.error.code, code, response.command);
}

function issueTypes(graph) {
  return graph.issues.map(issue => issue.trackId + ':' + issue.type).sort();
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);

  const setTracks = expectOk(send('setTracks', {
    tracks: [
      {
        id: 'track-1',
        name: 'Lead',
        type: 'software_instrument',
        routingOutputTrackId: 'bus-1',
        routingSends: [{targetTrackId: 'aux-1', gainDb: -12, preFader: true}],
        routingSidechainSourceTrackId: 'track-2',
      },
      {id: 'track-2', name: 'Kick', type: 'audio'},
      {id: 'bus-1', name: 'Music Bus', type: 'audio', routingRole: 'bus'},
      {id: 'aux-1', name: 'Verb', type: 'audio', routingRole: 'aux_return'},
    ],
  }));
  assert.equal(setTracks.nativeRouting.directOutputCount, 1);
  assert.equal(setTracks.nativeRouting.auxSendCount, 1);
  assert.equal(setTracks.nativeRouting.auxReturnCount, 1);
  assert.equal(setTracks.nativeRouting.skippedAuxSendCount, 0);
  assert.equal(setTracks.nativeRouting.skippedAuxReturnCount, 0);
  assert.equal(setTracks.nativeRouting.sidechainRequestCount, 1);
  assert.equal(setTracks.nativeRouting.sidechainAppliedTrackCount, 0);
  assert.equal(setTracks.nativeRouting.sidechainAppliedPluginCount, 0);
  assert.equal(setTracks.nativeRouting.skippedSidechainCount, 1);

  const projectGraph = expectOk(send('get_routing_graph'));
  assert.equal(projectGraph.routingGraphVersion, 1);
  assert.equal(projectGraph.source, 'project_state');
  assert.equal(projectGraph.trackCount, 4);
  assert.equal(projectGraph.issueCount, 0);
  assert.equal(projectGraph.roleCounts.track, 2);
  assert.equal(projectGraph.roleCounts.bus, 1);
  assert.equal(projectGraph.roleCounts.aux_return, 1);
  const bus = projectGraph.tracks.find(track => track.id === 'bus-1');
  const aux = projectGraph.tracks.find(track => track.id === 'aux-1');
  const kick = projectGraph.tracks.find(track => track.id === 'track-2');
  assert.deepEqual(bus.outputReceivesFrom, ['track-1']);
  assert.equal(aux.sendReceivesFrom[0].trackId, 'track-1');
  assert.equal(aux.sendReceivesFrom[0].preFader, true);
  assert.deepEqual(kick.sidechainConsumers, ['track-1']);
  const routedMix = expectOk(send('get_track_mix', {trackId: 'track-1'}));
  assert.equal(routedMix.tracks[0].routingOutputTrackId, 'bus-1');
  assert.equal(routedMix.tracks[0].nativeRoutingOutputTrackId, 'bus-1');
  assert.equal(routedMix.channelStripVersion, 6);
  assert.equal(routedMix.tracks[0].nativeAuxSendCount, 1);
  assert.equal(routedMix.tracks[0].nativeAuxSends[0].busNumber, 0);
  assert.equal(routedMix.tracks[0].nativeAuxSends[0].targetTrackId, 'aux-1');
  assert.equal(routedMix.tracks[0].nativeAuxSends[0].muted, false);
  assert.equal(routedMix.tracks[0].nativeAuxSends[0].preFader, true);
  assert.equal(Math.round(routedMix.tracks[0].nativeAuxSends[0].gainDb), -12);
  assert.equal(routedMix.tracks[0].nativeSidechainPluginCount, 0);
  assert.deepEqual(routedMix.tracks[0].nativeSidechainPlugins, []);
  const auxMix = expectOk(send('get_track_mix', {trackId: 'aux-1'}));
  assert.equal(auxMix.tracks[0].nativeAuxReturnBusNumber, 0);

  const invalidGraph = expectOk(send('get_routing_graph', {
    tracks: [
      {
        id: 'a',
        routingRole: 'not-a-role',
        routingOutputTrackId: 'b',
        routingSends: [{targetTrackId: 'a'}, {targetTrackId: 'missing'}],
        routingSidechainSourceTrackId: 'a',
      },
      {id: 'b', routingOutputTrackId: 'a'},
      {
        id: 'c',
        routingOutputTrackId: 'missing',
        routingSends: [{targetTrackId: ''}],
        routingSidechainSourceTrackId: 'missing',
      },
    ],
  }));
  assert.equal(invalidGraph.source, 'payload');
  assert.equal(invalidGraph.hasRoutingIssues, true);
  assert.deepEqual(issueTypes(invalidGraph), [
    'a:invalid-role',
    'a:output-cycle',
    'a:self-send',
    'a:self-sidechain',
    'a:missing-send',
    'b:output-cycle',
    'c:missing-output',
    'c:missing-send',
    'c:missing-sidechain',
  ].sort());

  expectError(sendRaw('get_routing_graph', '{"tracks":{}}'), 'invalid_payload');
  expectError(sendRaw('get_routing_graph', '{'), 'invalid_payload');

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
      `native routing graph smoke failed: status=${result.status ?? 'null'} signal=${result.signal ?? 'null'}`,
    );
  }
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
