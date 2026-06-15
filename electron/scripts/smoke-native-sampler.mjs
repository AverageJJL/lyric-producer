import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const addonPath = path.join(
  repoRoot,
  'electron/native/build-release/Release/native_audio_engine.node',
);

if (!existsSync(addonPath)) {
  throw new Error(
    `Native addon missing. Run npm run build:engine first: ${addonPath}`,
  );
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-sampler-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');

const samplerSamples = [
  {
    presetId: 'splendid_grand_lite',
    note: 60,
    sample: {
      name: 'Piano C4',
      relativePath: 'instruments/piano/splendid-grand/FF C4.flac',
      rootNote: 60,
      minNote: 59,
      maxNote: 62,
      gainDb: -9,
    },
  },
  {
    presetId: 'growly_bass_lite',
    note: 45,
    sample: {
      name: 'Bass A2',
      relativePath: 'instruments/bass/growlybass/a2_f_rr1.wav',
      rootNote: 45,
      minNote: 44,
      maxNote: 46,
      gainDb: -5,
    },
  },
  {
    presetId: 'emily_guitar_lite',
    note: 60,
    sample: {
      name: 'Guitar C4',
      relativePath: 'instruments/guitar/emilyguitar/c4_mf_rr1.wav',
      rootNote: 60,
      minNote: 59,
      maxNote: 65,
      gainDb: -4,
    },
  },
];

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};
const samplerSamples = ${JSON.stringify(samplerSamples)};

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  assert.equal(send('setTracks', {
    tracks: [{
      id: 'track-1',
      name: 'Sampler Track',
      isMuted: false,
      isSolo: false,
      type: 'software_instrument',
      instrumentId: 'keys_piano',
      presetId: 'splendid_grand_lite',
      isRecordArmed: false,
    }],
  }).ok, true);

  for (const item of samplerSamples) {
    const result = send('assign_track_instrument', {
      trackId: 'track-1',
      instrument: 'sample_instrument',
      presetId: item.presetId,
      params: {preset: item.presetId, samples: [item.sample]},
    });
    assert.equal(result.ok, true);
    assert.equal(result.data.instrument, 'sample_instrument');
    assert.equal(result.data.presetId, item.presetId);
    assert.equal(send('midi_note_on', {
      trackId: 'track-1',
      note: item.note,
      velocity: 96,
      channel: 0,
    }).ok, true);
    assert.equal(send('midi_note_off', {
      trackId: 'track-1',
      note: item.note,
      channel: 0,
    }).ok, true);
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
  const result = spawnSync(electronPath, [smokeMainPath], { stdio: 'inherit' });
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
