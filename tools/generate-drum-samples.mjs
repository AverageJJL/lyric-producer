/**
 * Generates tiny synthetic drum one-shots for the pop starter kit.
 * Run: node tools/generate-drum-samples.mjs
 */
import {mkdirSync, writeFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outputDir = join(__dirname, '..', 'assets', 'drums');

const SAMPLE_RATE = 44100;

function writeWav(filePath, samples) {
  const numSamples = samples.length;
  const dataSize = numSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  for (let index = 0; index < numSamples; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + index * 2);
  }

  writeFileSync(filePath, buffer);
}

function envelope(length, attack, decay) {
  return Array.from({length}, (_, index) => {
    if (index < attack) {
      return index / attack;
    }
    const decayIndex = index - attack;
    return Math.max(0, 1 - decayIndex / decay);
  });
}

function generateKick() {
  const length = Math.floor(SAMPLE_RATE * 0.35);
  const env = envelope(length, 40, length - 40);
  return env.map((amp, index) => {
    const t = index / SAMPLE_RATE;
    const pitch = 90 * Math.exp(-t * 14) + 42;
    return amp * Math.sin(2 * Math.PI * pitch * t) * 0.95;
  });
}

function generateSnare() {
  const length = Math.floor(SAMPLE_RATE * 0.22);
  const env = envelope(length, 10, length - 10);
  return env.map((amp, index) => {
    const tone = Math.sin(2 * Math.PI * 180 * (index / SAMPLE_RATE)) * 0.35;
    const noise = (Math.random() * 2 - 1) * 0.65;
    return amp * (tone + noise);
  });
}

function generateHat(decaySeconds) {
  const length = Math.floor(SAMPLE_RATE * decaySeconds);
  const env = envelope(length, 4, length - 4);
  return env.map((amp, index) => {
    const noise = (Math.random() * 2 - 1) * 0.55;
    const tone = Math.sin(2 * Math.PI * 8000 * (index / SAMPLE_RATE)) * 0.08;
    return amp * (noise + tone);
  });
}

mkdirSync(outputDir, {recursive: true});

writeWav(join(outputDir, 'kick.wav'), generateKick());
writeWav(join(outputDir, 'snare.wav'), generateSnare());
writeWav(join(outputDir, 'hatClosed.wav'), generateHat(0.06));
writeWav(join(outputDir, 'hatOpen.wav'), generateHat(0.18));

console.log(`Wrote drum samples to ${outputDir}`);
