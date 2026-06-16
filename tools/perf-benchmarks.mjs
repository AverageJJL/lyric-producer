import fs from 'fs';
import {createRequire} from 'module';

const require = createRequire(import.meta.url);
const ts = require('typescript');

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function runRounds(fn, iterations, rounds = 7) {
  fn(Math.min(10000, iterations));
  const timings = [];
  for (let round = 0; round < rounds; round += 1) {
    if (global.gc) {
      global.gc();
    }
    const start = process.hrtime.bigint();
    const checksum = fn(iterations);
    timings.push({
      checksum,
      ms: Number(process.hrtime.bigint() - start) / 1e6,
    });
  }
  return {
    iterations,
    medianMs: median(timings.map(timing => timing.ms)),
    rounds: timings.map(timing => timing.ms),
    checksum: timings[timings.length - 1]?.checksum ?? 0,
  };
}

function benchDrumKitMap() {
  const {buildDrumKitSampleMap} = require('../src/assets/drumKit.ts');
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const map = buildDrumKitSampleMap();
      checksum += map.kick.length + map.clap.length;
    }
    return checksum;
  }, 1000000);
}

function benchNativeBlockFingerprint() {
  const {nativeBlockFingerprint} = require('../src/native/blockSync.ts');
  const waveformPeaks = Array.from({length: 8192}, (_, index) => Math.sin(index / 13));
  const notes = Array.from({length: 128}, (_, index) => ({
    id: `note-${index}`,
    lengthBeats: 0.25,
    pitch: 48 + (index % 24),
    startBeat: index * 0.25,
    velocity: 90,
  }));
  const block = {
    absoluteAudioFilePath: '/tmp/take.wav',
    audioFilePath: 'media/take.wav',
    clipGainDb: -1.5,
    color: 'red',
    durationSeconds: 128,
    fadeInBeats: 0.25,
    fadeOutBeats: 0.5,
    id: 'block-audio-1',
    isReversed: false,
    lengthBeats: 64,
    name: 'Audio',
    notes,
    sourceLengthBeats: 64,
    sourceOffsetBeats: 0,
    startBeat: 12,
    trackId: 'track-1',
    type: 'audio',
    waveformPeaks,
  };
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      checksum += nativeBlockFingerprint(block).length;
    }
    return checksum;
  }, 20000);
}

function benchClipBulkMove() {
  const {blocksAfterSelectedClipMove} = require('../src/arrangement/clipBulkMove.ts');
  const trackIds = Array.from({length: 24}, (_, track) => `track-${track}`);
  const blocks = [];
  for (let track = 0; track < trackIds.length; track += 1) {
    for (let index = 0; index < 80; index += 1) {
      blocks.push({
        color: '#000',
        id: `b-${track}-${index}`,
        lengthBeats: 1.5,
        name: `B ${track}-${index}`,
        notes: [],
        startBeat: index * 3,
        trackId: trackIds[track],
        type: 'midi',
      });
    }
  }
  const selectedBlockIds = Array.from({length: 10}, (_, index) => `b-${index}-${20 + index}`);
  const input = {
    anchorBlockId: selectedBlockIds[0],
    blocks,
    maxTimelineBeat: 256,
    selectedBlockIds,
    targetStartBeat: 60,
    targetTrackId: 'track-4',
    trackIds,
  };
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const moved = blocksAfterSelectedClipMove(input);
      checksum += moved ? moved.length : 0;
    }
    return checksum;
  }, 500);
}

function benchTempoMapTiming() {
  const {
    tempoMapBeatAtSeconds,
    tempoMapBpmAtBeat,
    tempoMapSecondsAtBeat,
    tempoMapSecondsBetweenBeats,
  } = require('../src/transport/tempoMapTiming.ts');
  const events = Array.from({length: 128}, (_, index) => ({
    beat: (index + 1) * 4,
    bpm: 70 + ((index * 17) % 110),
    id: `tempo-${index + 1}`,
    ramp: index % 3 === 0 ? 'linear' : 'jump',
  }));
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const beat = (index % 512) + ((index % 10) / 10);
      checksum += tempoMapBpmAtBeat(beat, 120, events);
      checksum += tempoMapSecondsAtBeat(beat, 120, events);
      checksum += tempoMapSecondsBetweenBeats(Math.max(0, beat - 2.5), beat + 3.25, 120, events);
      checksum += tempoMapBeatAtSeconds((index % 800) / 3, 120, events);
    }
    return checksum;
  }, 10000);
}

function benchTimelineRulerModel() {
  const {buildTimelineRulerModel} = require('../src/ui/timelineRulerMap.ts');
  const input = {
    meterMap: Array.from({length: 64}, (_, index) => ({
      beat: index * 32,
      id: `meter-${index}`,
      timeSignature: {
        denominator: index % 2 ? 8 : 4,
        numerator: 3 + (index % 5),
      },
    })),
    snapGrid: '1/32',
    tempoMap: Array.from({length: 128}, (_, index) => ({
      beat: index * 16,
      bpm: 80 + (index % 80),
      id: `tempo-${index}`,
      ramp: index % 2 ? 'jump' : 'linear',
    })),
    timeSignature: {numerator: 4, denominator: 4},
    visibleTimelineBeats: 2048,
  };
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const model = buildTimelineRulerModel(input);
      checksum += model.rulerTicks.length + model.gridLines.length + model.mapMarkers.length;
    }
    return checksum;
  }, 200);
}

function benchWaveformPreviewLayout() {
  const {waveformPreviewLayout} = require('../src/music/waveformPreviewLayout.ts');
  const peaks = Array.from(
    {length: 20000},
    (_, index) => Math.abs(Math.sin(index / 17) * Math.cos(index / 97)),
  );
  return runRounds(iterations => {
    let checksum = 0;
    for (let index = 0; index < iterations; index += 1) {
      const layout = waveformPreviewLayout(
        peaks,
        true,
        128,
        8192,
        72,
        128,
        0,
        64,
        8192,
      );
      checksum += layout.pathD.length + (layout.hasAudibleWaveform ? 1 : 0);
    }
    return checksum;
  }, 100);
}

const benchmarks = {
  all: () => ({
    'clip-bulk-move': benchClipBulkMove(),
    'drum-kit-map': benchDrumKitMap(),
    'native-block-fingerprint': benchNativeBlockFingerprint(),
    'timeline-ruler-model': benchTimelineRulerModel(),
    'tempo-map-timing': benchTempoMapTiming(),
    'waveform-preview-layout': benchWaveformPreviewLayout(),
  }),
  'clip-bulk-move': benchClipBulkMove,
  'drum-kit-map': benchDrumKitMap,
  'native-block-fingerprint': benchNativeBlockFingerprint,
  'timeline-ruler-model': benchTimelineRulerModel,
  'tempo-map-timing': benchTempoMapTiming,
  'waveform-preview-layout': benchWaveformPreviewLayout,
};

const name = process.argv[2] ?? 'all';
const benchmark = benchmarks[name];

if (!benchmark) {
  console.error(`Unknown benchmark "${name}". Options: ${Object.keys(benchmarks).join(', ')}`);
  process.exit(1);
}

console.log(JSON.stringify({benchmark: name, result: benchmark()}, null, 2));
