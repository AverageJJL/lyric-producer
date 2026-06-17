import type {DAWBlock} from '../store/useDAWStore';
import {BLOCK_COLORS} from '../ui/timelineLayout';

export type AudioAnalysis = {
  lengthBeats?: number;
  durationSeconds?: number;
  sampleRate?: number;
  channelCount?: number;
  fileBytes?: number;
  peakAmplitude?: number;
  waveformPeaks?: number[];
};

export type ImportedAudioBlockOptions = {
  trackId: string;
  trackIndex: number;
  startBeat: number;
  name: string;
  relativePath: string;
  absolutePath: string;
  analysis: AudioAnalysis;
  projectSampleRate?: number;
};

function safeLengthBeats(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(1, value)
    : 4;
}

function safePeaks(peaks: number[] | undefined): number[] {
  return Array.isArray(peaks)
    ? peaks.filter(peak => Number.isFinite(peak)).map(peak => Math.max(0, Math.min(1, peak)))
    : [];
}

function safePositiveNumber(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

export function audioSampleRateWarning(
  sourceSampleRate: number | undefined,
  projectSampleRate: number | undefined,
): string | undefined {
  if (!sourceSampleRate || !projectSampleRate) {
    return undefined;
  }
  const source = Math.round(sourceSampleRate);
  const project = Math.round(projectSampleRate);
  return source === project
    ? undefined
    : `Source sample rate ${source} Hz differs from device ${project} Hz.`;
}

export function createImportedAudioBlock(options: ImportedAudioBlockOptions): DAWBlock {
  const lengthBeats = safeLengthBeats(options.analysis.lengthBeats);
  const sourceSampleRate = safePositiveNumber(options.analysis.sampleRate);

  return {
    id: `block-import-${Date.now()}`,
    trackId: options.trackId,
    name: options.name || 'Imported Audio',
    startBeat: Math.max(0, options.startBeat),
    lengthBeats,
    type: 'audio',
    color: BLOCK_COLORS[options.trackIndex % BLOCK_COLORS.length],
    sourceLengthBeats: lengthBeats,
    sourceOffsetBeats: 0,
    audioFilePath: options.relativePath,
    absoluteAudioFilePath: options.absolutePath,
    waveformPeaks: safePeaks(options.analysis.waveformPeaks),
    durationSeconds: options.analysis.durationSeconds,
    sourceSampleRate,
    sourceChannelCount: safePositiveNumber(options.analysis.channelCount),
    sourceFileBytes: safePositiveNumber(options.analysis.fileBytes),
    sourcePeakAmplitude: safePositiveNumber(options.analysis.peakAmplitude),
    mediaValidationWarning: audioSampleRateWarning(sourceSampleRate, options.projectSampleRate),
  };
}
