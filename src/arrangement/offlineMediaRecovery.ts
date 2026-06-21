import {audioSampleRateWarning, type AudioAnalysis} from '../music/audioImport';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import type {MediaImportBridge, OfflineAudioRecovery} from '../native/mediaImportApi';
import {type AudioBlockMediaReplacement, useDAWStore} from '../store/useDAWStore';
import {collectMediaSourceInventory, type MediaSourceInventoryItem} from './mediaSourceInventory';

export type OfflineMediaRecoveryResult =
  | {
      ok: true;
      canceled?: boolean;
      recoveredSourceCount: number;
      recoveredClipCount: number;
      missingSourceCount: number;
      failedSourceCount: number;
    }
  | {ok: false; error: string; canceled?: boolean};

function parseCommandData(response: string | null): Record<string, unknown> | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    return parsed.ok === true ? parsed.data ?? null : null;
  } catch {
    return null;
  }
}

async function analyzeAudioFile(absolutePath: string): Promise<AudioAnalysis | null> {
  return parseCommandData(await sendNativeAudioCommandAsync('analyze_audio_file', {
    absoluteAudioFilePath: absolutePath,
  })) as AudioAnalysis | null;
}

function currentEngineSampleRate(): number | undefined {
  const data = parseCommandData(sendNativeAudioCommand('engine_status_fast', {}));
  const sampleRate = data?.sampleRate;
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0
    ? sampleRate
    : undefined;
}

function offlineSources(blocks = useDAWStore.getState().blocks): MediaSourceInventoryItem[] {
  return collectMediaSourceInventory(blocks).filter(item => item.status === 'missing');
}

function replacementMedia(
  item: MediaSourceInventoryItem,
  recovered: OfflineAudioRecovery,
  analysis: AudioAnalysis,
  projectSampleRate: number | undefined,
): Array<{blockId: string; media: AudioBlockMediaReplacement}> {
  return item.blocks.map(block => ({
    blockId: block.id,
    media: {
      name: block.name,
      audioFilePath: recovered.relativePath,
      absoluteAudioFilePath: recovered.absolutePath,
      mediaSourceName: block.mediaSourceName ?? recovered.name,
      lengthBeats: analysis.lengthBeats,
      durationSeconds: analysis.durationSeconds,
      waveformPeaks: analysis.waveformPeaks,
      sourceSampleRate: analysis.sampleRate,
      sourceChannelCount: analysis.channelCount,
      sourceFileBytes: analysis.fileBytes,
      sourcePeakAmplitude: analysis.peakAmplitude,
      mediaValidationWarning: audioSampleRateWarning(analysis.sampleRate, projectSampleRate),
    },
  }));
}

export function offlineMediaRecoveryMessage(
  result: Extract<OfflineMediaRecoveryResult, {ok: true}>,
): string {
  if (result.canceled) {
    return '';
  }
  if (
    result.recoveredClipCount === 0 &&
    result.missingSourceCount === 0 &&
    result.failedSourceCount === 0
  ) {
    return 'No offline media to recover.';
  }
  if (result.failedSourceCount > 0 || result.missingSourceCount > 0) {
    return `Recovered ${result.recoveredClipCount} clips; ${result.missingSourceCount} missing, ${result.failedSourceCount} failed.`;
  }
  return `Recovered ${result.recoveredClipCount} clips.`;
}

export async function recoverOfflineMediaSources(
  bridge: MediaImportBridge | null,
): Promise<OfflineMediaRecoveryResult> {
  if (!bridge?.recoverOfflineAudio) {
    return {ok: false, error: 'Offline media recovery API is unavailable.'};
  }

  const sources = offlineSources();
  if (sources.length === 0) {
    return {
      ok: true,
      recoveredSourceCount: 0,
      recoveredClipCount: 0,
      missingSourceCount: 0,
      failedSourceCount: 0,
    };
  }

  const response = await bridge.recoverOfflineAudio({
    sources: sources.map(item => ({
      sourceKey: item.sourceKey,
      sourcePath: item.sourcePath,
      name: item.name,
    })),
  });
  if (!response.ok) {
    return {ok: false, error: response.error, canceled: response.canceled};
  }

  const bySourceKey = new Map(sources.map(item => [item.sourceKey, item]));
  const projectSampleRate = currentEngineSampleRate();
  const replacements: Array<{blockId: string; media: AudioBlockMediaReplacement}> = [];
  let failedSourceCount = 0;

  for (const recovered of response.recovered) {
    const item = bySourceKey.get(recovered.sourceKey);
    const analysis = await analyzeAudioFile(recovered.absolutePath);
    if (!item || !analysis) {
      failedSourceCount += 1;
      continue;
    }
    replacements.push(...replacementMedia(item, recovered, analysis, projectSampleRate));
  }

  if (replacements.length > 0) {
    useDAWStore.getState().replaceAudioBlocksMedia(replacements);
  }

  return {
    ok: true,
    recoveredSourceCount: response.recovered.length - failedSourceCount,
    recoveredClipCount: replacements.length,
    missingSourceCount: response.missing.length,
    failedSourceCount,
  };
}
