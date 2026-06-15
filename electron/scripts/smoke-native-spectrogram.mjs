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
const addonPath = path.join(
  repoRoot,
  'electron/native/build-release/Release/native_audio_engine.node',
);

if (!existsSync(addonPath)) {
  throw new Error(`Native addon missing. Run npm run build:engine first: ${addonPath}`);
}

/** Minimal mono 16-bit PCM WAV (440 Hz tone, ~0.25 s @ 22050 Hz). */
function writeTinyWav(filePath) {
  const sampleRate = 22050;
  const numSamples = 5512;
  const numChannels = 1;
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < numSamples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 16000), 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-spec-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');
const clipId = 'smoke-spec-clip';
const wavPath = path.join(tempRoot, 'recordings', `${clipId}.wav`);

mkdirSync(path.dirname(wavPath), {recursive: true});
writeTinyWav(wavPath);

const smokeMain = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

const requestId = 'spec-smoke-1';
let readyPayload = null;

addon.setEventCallback((eventName, payloadJson) => {
  if (eventName === 'onSpectrogramReady') {
    readyPayload = parse(payloadJson);
  }
});

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);

  const started = send('render_spectrogram', {
    requestId,
    audioPath: 'recordings/${clipId}.wav',
    width: 256,
    height: 128,
    source: 'recorded_wav',
  });
  assert.equal(started.ok, true);
  assert.equal(started.data.status, 'started');

  const absolutePng = path.join(writableRoot, 'spectrograms', '${clipId}.png');
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    if (fs.existsSync(absolutePng) && fs.statSync(absolutePng).size > 64) {
      break;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }

  assert.ok(fs.existsSync(absolutePng), 'PNG file missing: ' + absolutePng);
  assert.ok(fs.statSync(absolutePng).size > 64);

  // Drain briefly for onSpectrogramReady (may lag behind transport spam in headless smoke).
  const eventDeadline = Date.now() + 2000;
  while (!readyPayload && Date.now() < eventDeadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
  if (readyPayload) {
    assert.equal(readyPayload.requestId, requestId);
    assert.equal(readyPayload.ok, true);
    assert.equal(readyPayload.pngPath, 'spectrograms/${clipId}.png');
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
    stdio: 'inherit',
    env: {...process.env, ELECTRON_RUN_AS_NODE: '1'},
  });
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
