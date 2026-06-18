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

function writeOffsetProbeWav(filePath) {
  const sampleRate = 44100;
  const numSamples = sampleRate;
  const blockAlign = 2;
  const dataSize = numSamples * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = sampleRate / 2; i < numSamples; i += 1) {
    const sample = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
    buffer.writeInt16LE(Math.round(sample * 14000), 44 + i * 2);
  }
  writeFileSync(filePath, buffer);
}

const tempRoot = mkdtempSync(path.join(tmpdir(), 'musicapp-native-audio-offset-'));
const smokeMainPath = path.join(tempRoot, 'main.cjs');
const wavPath = path.join(tempRoot, 'imports', 'offset-probe.wav');
const unsupportedPath = path.join(tempRoot, 'imports', 'unsupported.mp3');
const mixPath = path.join(tempRoot, 'mix', 'offset-render.wav');
const reverseMixPath = path.join(tempRoot, 'mix', 'reverse-render.wav');

mkdirSync(path.dirname(wavPath), {recursive: true});
writeOffsetProbeWav(wavPath);
writeFileSync(unsupportedPath, Buffer.alloc(128));

const smokeMain = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const addon = require(${JSON.stringify(addonPath)});
const assetRoot = ${JSON.stringify(path.join(repoRoot, 'assets'))};
const writableRoot = ${JSON.stringify(tempRoot)};
const wavPath = ${JSON.stringify(wavPath)};
const unsupportedPath = ${JSON.stringify(unsupportedPath)};
const mixPath = ${JSON.stringify(mixPath)};
const stemMixPath = ${JSON.stringify(path.join(tempRoot, 'mix', 'offset-stem.wav'))};
const clipMixPath = ${JSON.stringify(path.join(tempRoot, 'mix', 'offset-clip.wav'))};
const reverseMixPath = ${JSON.stringify(reverseMixPath)};

function parse(raw) {
  return JSON.parse(raw);
}

function send(command, payload) {
  return parse(addon.sendCommand(command, JSON.stringify(payload)));
}

function renderedPeak(filePath, startFrame = 0, frameCount = 4096) {
  const wav = fs.readFileSync(filePath);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  let fmt = null;
  let data = null;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const id = wav.toString('ascii', offset, offset + 4);
    const size = wav.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      fmt = {
        format: wav.readUInt16LE(offset + 8),
        channels: wav.readUInt16LE(offset + 10),
        bits: wav.readUInt16LE(offset + 22),
      };
    } else if (id === 'data') {
      data = {offset: offset + 8, size};
      break;
    }
    offset += 8 + size + (size % 2);
  }
  assert.ok(fmt, 'WAV fmt chunk missing');
  assert.ok(data, 'WAV data chunk missing');
  const bytesPerSample = fmt.bits / 8;
  const totalFrames = Math.floor(data.size / (bytesPerSample * fmt.channels));
  const frames = Math.min(frameCount, Math.max(0, totalFrames - startFrame));
  let peak = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let ch = 0; ch < fmt.channels; ch += 1) {
      const at = data.offset + ((startFrame + frame) * fmt.channels + ch) * bytesPerSample;
      const sample = fmt.format === 3
        ? Math.abs(wav.readFloatLE(at))
        : Math.abs(wav.readIntLE(at, bytesPerSample) / (2 ** (fmt.bits - 1)));
      peak = Math.max(peak, sample);
    }
  }
  return peak;
}

try {
  assert.equal(parse(addon.initEngine(assetRoot, writableRoot)).ok, true);
  assert.equal(send('set_bpm', {bpm: 120}).ok, true);
  assert.equal(send('setTracks', {
    tracks: [{
      id: 'track-audio',
      name: 'Voice',
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isMuted: false,
      isSolo: false,
      isRecordArmed: false,
    }],
  }).ok, true);

  const analysis = send('analyze_audio_file', {absoluteAudioFilePath: wavPath});
  assert.equal(analysis.ok, true);
  assert.ok(analysis.data.peakAmplitude > 0.3, 'native analysis peak too low');
  assert.ok(analysis.data.peakAmplitude < 0.5, 'native analysis peak too high');

  const tempoMapped = send('set_tempo_map', {
    bpm: 120,
    timeSignature: {numerator: 4, denominator: 4},
    tempoMap: [{id: 'slow-after-one', beat: 1, bpm: 60, ramp: 'jump'}],
    meterMap: [],
  });
  assert.equal(tempoMapped.ok, true);
  const tempoMapAnalysis = send('analyze_audio_file', {absoluteAudioFilePath: wavPath});
  assert.equal(tempoMapAnalysis.ok, true);
  assert.ok(
    tempoMapAnalysis.data.lengthBeats > 1.4 && tempoMapAnalysis.data.lengthBeats < 1.6,
    'tempo-map analysis ignored tempo sequence: lengthBeats=' + tempoMapAnalysis.data.lengthBeats,
  );
  assert.equal(send('set_tempo_map', {
    bpm: 120,
    timeSignature: {numerator: 4, denominator: 4},
    tempoMap: [],
    meterMap: [],
  }).ok, true);

  const unsupportedUpsert = send('upsert_audio_clip', {
    clipId: 'unsupported-probe',
    trackId: 'track-audio',
    startBeat: 0,
    lengthBeats: 1,
    audioFilePath: 'imports/unsupported.mp3',
    absoluteAudioFilePath: unsupportedPath,
  });
  assert.equal(unsupportedUpsert.ok, false);
  assert.equal(unsupportedUpsert.error.code, 'unsupported_file');

  const upsert = send('upsert_audio_clip', {
    clipId: 'offset-probe',
    trackId: 'track-audio',
    startBeat: 0,
    lengthBeats: 1,
    sourceLengthBeats: 2,
    sourceOffsetBeats: 1,
    clipGainDb: -12,
    fadeInBeats: 0.5,
    fadeOutBeats: 0,
    audioFilePath: 'imports/offset-probe.wav',
    absoluteAudioFilePath: wavPath,
  });
  assert.equal(upsert.ok, true);
  assert.equal(upsert.data.clipCount, 1);

  const rendered = send('render_mixdown', {path: mixPath});
  assert.equal(rendered.ok, true);
  assert.ok(fs.statSync(mixPath).size > 64);
  const firstPeak = renderedPeak(mixPath, 0, 2048);
  const laterPeak = renderedPeak(mixPath, 16000, 4096);
  assert.ok(
    laterPeak > 0.04,
    'source offset render stayed silent after fade-in: first=' + firstPeak + ' later=' + laterPeak,
  );
  assert.ok(
    firstPeak < laterPeak / 2,
    'clip fade-in was not applied: first=' + firstPeak + ' later=' + laterPeak,
  );
  assert.ok(laterPeak < 0.2, 'clip gain was not applied: peak=' + laterPeak);

  const stemRendered = send('render_mixdown', {path: stemMixPath, trackId: 'track-audio'});
  assert.equal(stemRendered.ok, true);
  assert.equal(stemRendered.data.trackId, 'track-audio');
  assert.ok(fs.statSync(stemMixPath).size > 64);

  const clipRendered = send('render_mixdown', {
    path: clipMixPath,
    trackId: 'track-audio',
    startBeat: 0,
    endBeat: 1,
    tailBeats: 0.5,
  });
  assert.equal(clipRendered.ok, true);
  assert.equal(clipRendered.data.trackId, 'track-audio');
  assert.equal(clipRendered.data.startBeat, 0);
  assert.equal(clipRendered.data.endBeat, 1);
  assert.equal(clipRendered.data.tailBeats, 0.5);
  assert.ok(fs.statSync(clipMixPath).size > 64);

  assert.equal(send('delete_clip', {clipId: 'offset-probe'}).ok, true);
  const reverseUpsert = send('upsert_audio_clip', {
    clipId: 'reverse-probe',
    trackId: 'track-audio',
    startBeat: 0,
    lengthBeats: 2,
    sourceLengthBeats: 2,
    sourceOffsetBeats: 0,
    clipGainDb: -12,
    fadeInBeats: 0,
    fadeOutBeats: 0,
    isReversed: true,
    audioFilePath: 'imports/offset-probe.wav',
    absoluteAudioFilePath: wavPath,
  });
  assert.equal(reverseUpsert.ok, true);
  assert.equal(reverseUpsert.data.clipCount, 1);

  const reversed = send('render_mixdown', {path: reverseMixPath});
  assert.equal(reversed.ok, true);
  assert.ok(fs.statSync(reverseMixPath).size > 64);
  const reversedStartPeak = renderedPeak(reverseMixPath, 0, 4096);
  const reversedLatePeak = renderedPeak(reverseMixPath, 32000, 4096);
  assert.ok(reversedStartPeak > 0.05, 'reverse render did not start with source tail');
  assert.ok(reversedLatePeak < 0.01, 'reverse render did not move source silence to the tail');

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
  process.exit(result.status ?? 1);
} finally {
  rmSync(tempRoot, {recursive: true, force: true});
}
