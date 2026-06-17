import {audioSampleRateWarning, type AudioAnalysis} from '../music/audioImport';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import type {MediaImportBridge} from '../native/mediaImportApi';
import {type AudioBlockMediaReplacement, useDAWStore} from '../store/useDAWStore';
import {mediaConsolidationGroups} from './mediaConsolidation';

export type ProjectMediaConsolidationResult =
  | {
      ok: true;
      consolidatedClipCount: number;
      failedClipCount: number;
    }
  | {ok: false; error: string};

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

function analyzeAudioFile(absolutePath: string): AudioAnalysis | null {
  return parseCommandData(sendNativeAudioCommand('analyze_audio_file', {
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

export function projectMediaConsolidationMessage(
  result: Extract<ProjectMediaConsolidationResult, {ok: true}>,
): string {
  if (result.consolidatedClipCount === 0 && result.failedClipCount === 0) {
    return 'All linked media is already project-managed.';
  }
  return result.failedClipCount > 0
    ? `Consolidated ${result.consolidatedClipCount} clips; ${result.failedClipCount} failed.`
    : `Consolidated ${result.consolidatedClipCount} clips.`;
}

function replacementMedia(
  blockId: string,
  copied: {name: string; relativePath: string; absolutePath: string},
  analysis: AudioAnalysis,
  projectSampleRate: number | undefined,
): {blockId: string; media: AudioBlockMediaReplacement} {
  const block = useDAWStore.getState().blocks.find(item => item.id === blockId);
  return {
    blockId,
    media: {
      name: block?.name ?? copied.name,
      audioFilePath: copied.relativePath,
      absoluteAudioFilePath: copied.absolutePath,
      mediaSourceName: block?.mediaSourceName ?? copied.name,
      lengthBeats: analysis.lengthBeats,
      durationSeconds: analysis.durationSeconds,
      waveformPeaks: analysis.waveformPeaks,
      sourceSampleRate: analysis.sampleRate,
      sourceChannelCount: analysis.channelCount,
      sourceFileBytes: analysis.fileBytes,
      sourcePeakAmplitude: analysis.peakAmplitude,
      mediaValidationWarning: audioSampleRateWarning(analysis.sampleRate, projectSampleRate),
    },
  };
}

export async function consolidateProjectMediaSources(
  bridge: MediaImportBridge | null,
): Promise<ProjectMediaConsolidationResult> {
  if (!bridge?.duplicateAudio) {
    return {ok: false, error: 'Media consolidation API is unavailable.'};
  }

  const groups = mediaConsolidationGroups(useDAWStore.getState().blocks);
  if (groups.length === 0) {
    return {ok: true, consolidatedClipCount: 0, failedClipCount: 0};
  }

  const projectSampleRate = currentEngineSampleRate();
  const replacements: Array<{blockId: string; media: AudioBlockMediaReplacement}> = [];
  let failedClipCount = 0;

  for (const group of groups) {
    const copied = await bridge.duplicateAudio({path: group.sourcePath});
    if (!copied.ok) {
      failedClipCount += group.blockIds.length;
      continue;
    }

    const analysis = analyzeAudioFile(copied.absolutePath);
    if (!analysis) {
      failedClipCount += group.blockIds.length;
      continue;
    }

    replacements.push(
      ...group.blockIds.map(blockId =>
        replacementMedia(blockId, copied, analysis, projectSampleRate),
      ),
    );
  }

  if (replacements.length > 0) {
    useDAWStore.getState().replaceAudioBlocksMedia(replacements);
  }

  return {
    ok: true,
    consolidatedClipCount: replacements.length,
    failedClipCount,
  };
}
