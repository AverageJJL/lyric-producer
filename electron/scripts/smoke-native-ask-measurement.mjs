import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '../..');
const addonPath = path.join(repoRoot, 'electron/native/build-release/Release/native_audio_engine.node');

if (!existsSync(addonPath)) {
  throw new Error(`Native addon missing. Run npm run build:engine first: ${addonPath}`);
}

/** Mono 16-bit PCM WAV of a steady sine at `freq` Hz, amplitude 0.5 (~-6 dBFS), 1 s @ 48 kHz. */
function writeToneWav(filePath, freq) {
  const sampleRate = 48000;
  const numSamples = sampleRate;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const sample = 0.5 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
}

/** Hard-panned stereo: a 0.5-amplitude tone in the LEFT channel only, RIGHT silent. */
function writeHardPannedWav(filePath, freq) {
  const sampleRate = 48000;
  const numSamples = sampleRate;
  const dataSize = numSamples * 2 * 2; // 2 channels, 16-bit
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(2, 22); // stereo
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 4, 28);
  buffer.writeUInt16LE(4, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const sample = 0.5 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 4); // left
    buffer.writeInt16LE(0, 44 + i * 4 + 2); // right (silent)
  }
  writeFileSync(filePath, buffer);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-ask-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');
const clipId = 'smoke-ask-tone';
const wavPath = path.join(tempRoot, 'recordings', `${clipId}.wav`);
mkdirSync(path.dirname(wavPath), {recursive: true});
writeToneWav(wavPath, 440);
writeHardPannedWav(path.join(tempRoot, 'recordings', 'smoke-ask-panned.wav'), 440);

const smokeMain = `
const assert = require('node:assert/strict');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function send(command, payload) {
  return JSON.parse(addon.sendCommand(command, JSON.stringify(payload)));
}

try {
  assert.equal(JSON.parse(addon.initEngine(assetRoot, writableRoot)).ok, true);

  // --- measure_loudness ---
  const loud = send('measure_loudness', {audioPath: 'recordings/${clipId}.wav'});
  assert.equal(loud.ok, true, 'measure_loudness should succeed: ' + JSON.stringify(loud));
  for (const key of ['integratedLufs', 'shortTermLufs', 'momentaryLufs', 'rmsDb', 'peakDb']) {
    assert.equal(typeof loud.data[key], 'number', key + ' must be a number');
    assert.ok(Number.isFinite(loud.data[key]), key + ' must be finite, got ' + loud.data[key]);
  }
  // A 0.5-amplitude tone peaks near -6 dBFS.
  assert.ok(Math.abs(loud.data.peakDb - (-6.0)) < 1.5, 'peakDb ~ -6, got ' + loud.data.peakDb);
  assert.ok(loud.data.peakDb <= 0.01, 'peakDb must be <= 0 dBFS');
  assert.ok(loud.data.integratedLufs < 0 && loud.data.integratedLufs > -40, 'integratedLufs in range, got ' + loud.data.integratedLufs);

  // --- get_spectrum_bands (absolute) — the band containing 440 Hz should dominate ---
  const spec = send('get_spectrum_bands', {audioPath: 'recordings/${clipId}.wav'});
  assert.equal(spec.ok, true, 'get_spectrum_bands should succeed: ' + JSON.stringify(spec));
  assert.ok(Array.isArray(spec.data.bands) && spec.data.bands.length > 6, 'expected several bands');
  for (const band of spec.data.bands) {
    assert.equal(typeof band.lowHz, 'number');
    assert.equal(typeof band.highHz, 'number');
    assert.equal(typeof band.energyDb, 'number');
    assert.ok(band.highHz > band.lowHz, 'band edges ordered');
  }
  const peakBand = spec.data.bands.reduce((best, b) => (b.energyDb > best.energyDb ? b : best));
  assert.ok(peakBand.lowHz <= 440 && peakBand.highHz >= 440, 'loudest band should contain 440 Hz, got ' + JSON.stringify(peakBand));

  // --- loudnessMatch centers bands around 0 dB ---
  const matched = send('get_spectrum_bands', {audioPath: 'recordings/${clipId}.wav', loudnessMatch: true});
  assert.equal(matched.ok, true);
  assert.equal(matched.data.loudnessMatched, true);

  // --- clip segment: beat geometry is tempo-mapped to source seconds, not the whole file.
  // The 1 s file is 2 beats at the engine's default 120 BPM; a 0.5-beat clip trimmed 0.5
  // beats into the source measures the 0.25 s..0.5 s window (0.25 s long), not the full 1 s.
  const trimmed = send('measure_loudness', {audioPath: 'recordings/${clipId}.wav', startBeat: 0, lengthBeats: 0.5, sourceOffsetBeats: 0.5, sourceLengthBeats: 2.0});
  assert.equal(trimmed.ok, true, 'trimmed measure should succeed: ' + JSON.stringify(trimmed));
  assert.ok(Math.abs(trimmed.data.durationSeconds - 0.25) < 0.02, 'trim window honored, got ' + trimmed.data.durationSeconds);

  // --- clip gain is applied: a -6 dB clip gain on the -6 dBFS tone peaks near -12 dBFS ---
  const gained = send('measure_loudness', {audioPath: 'recordings/${clipId}.wav', clipGainDb: -6});
  assert.ok(Math.abs(gained.data.peakDb - (-12.0)) < 1.5, 'gain applied, peak ~ -12, got ' + gained.data.peakDb);

  // --- hard-panned stereo: per-channel measurement, NOT averaged to mono ---
  // Averaging L+R would halve the panned tone (~-12 dBFS); per-channel keeps it at ~-6.
  const panned = send('measure_loudness', {audioPath: 'recordings/smoke-ask-panned.wav'});
  assert.equal(panned.ok, true, 'panned measure should succeed: ' + JSON.stringify(panned));
  assert.equal(panned.data.channelCount, 2, 'stereo file reports 2 channels');
  assert.ok(Math.abs(panned.data.peakDb - (-6.0)) < 1.5, 'hard-panned peak preserved ~ -6, got ' + panned.data.peakDb);

  // --- negative cases ---
  const missing = send('measure_loudness', {audioPath: 'recordings/does-not-exist.wav'});
  assert.equal(missing.ok, false, 'missing file should error');
  assert.equal(missing.error.code, 'audio_not_found');
  const unsafe = send('measure_loudness', {audioPath: '../escape.wav'});
  assert.equal(unsafe.ok, false, 'unsafe path should error');

  addon.shutdownEngine();
  console.log('ask-measurement smoke OK: integratedLufs=' + loud.data.integratedLufs.toFixed(2) + ' peakDb=' + loud.data.peakDb.toFixed(2) + ' peakBand=' + Math.round(peakBand.lowHz) + '-' + Math.round(peakBand.highHz) + 'Hz');
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
