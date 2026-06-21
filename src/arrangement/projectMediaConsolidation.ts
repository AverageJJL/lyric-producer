import {audioSampleRateWarning, type AudioAnalysis} from '../music/audioImport';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import {
  audioFileNeedsPlaybackPreparation,
  prepareAudioFileForPlayback,
} from '../native/audioPlaybackPreparation';
import type {AudioMediaResolution, MediaImportBridge} from '../native/mediaImportApi';
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

function mediaNameFromPath(relativePath: string): string {
  const fileName = relativePath.split('/').pop() ?? relativePath;
  return fileName.replace(/\.[^.]+$/, '') || fileName;
}

function preparedMediaChanged(
  original: {relativePath: string; absolutePath: string},
  prepared: {relativePath: string; absolutePath: string},
): boolean {
  return original.relativePath !== prepared.relativePath ||
    original.absolutePath !== prepared.absolutePath;
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
  copied: {name?: string; relativePath: string; absolutePath: string},
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
      mediaSourceName: block?.mediaSourceName ?? copied.name ?? block?.name,
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

function audioBlocksWithMedia() {
  return useDAWStore.getState().blocks.filter(block =>
    block.type === 'audio' &&
    !block.isMissingMedia &&
    (block.audioFilePath || block.absoluteAudioFilePath),
  );
}

function shouldApplyResolution(
  blockId: string,
  resolution: AudioMediaResolution,
): boolean {
  const block = useDAWStore.getState().blocks.find(item => item.id === blockId);
  if (!block || !resolution.exists || !resolution.relativePath || !resolution.absolutePath) {
    return false;
  }
  return resolution.repaired === true ||
    block.audioFilePath !== resolution.relativePath ||
    block.absoluteAudioFilePath !== resolution.absolutePath;
}

async function consolidateViaResolver(
  bridge: MediaImportBridge,
  projectSampleRate: number | undefined,
): Promise<ProjectMediaConsolidationResult | null> {
  if (!bridge.resolveAudioMedia) {
    return null;
  }

  const blocks = audioBlocksWithMedia();
  if (blocks.length === 0) {
    return {ok: true, consolidatedClipCount: 0, failedClipCount: 0};
  }

  const response = await bridge.resolveAudioMedia({
    references: blocks.map(block => ({
      clipId: block.id,
      trackId: block.trackId,
      relativePath: block.audioFilePath,
      absolutePath: block.absoluteAudioFilePath,
    })),
  });
  if (!response.ok) {
    return null;
  }

  const replacements: Array<{blockId: string; media: AudioBlockMediaReplacement}> = [];
  let failedClipCount = 0;
  for (const resolution of response.resolved) {
    if (!resolution.exists) {
      failedClipCount += 1;
      continue;
    }
    const resolvedMedia = {
      name: mediaNameFromPath(resolution.relativePath!),
      relativePath: resolution.relativePath!,
      absolutePath: resolution.absolutePath!,
    };
    const needsPreparation = audioFileNeedsPlaybackPreparation(resolvedMedia);
    if (!shouldApplyResolution(resolution.clipId, resolution) && !needsPreparation) {
      continue;
    }
    const prepared = await prepareAudioFileForPlayback(resolvedMedia);
    if (!prepared) {
      failedClipCount += 1;
      continue;
    }
    if (!shouldApplyResolution(resolution.clipId, resolution) &&
        !preparedMediaChanged(resolvedMedia, prepared)) {
      continue;
    }
    const analysis = await analyzeAudioFile(prepared.absolutePath);
    if (!analysis) {
      failedClipCount += 1;
      continue;
    }
    replacements.push(replacementMedia(
      resolution.clipId,
      prepared,
      analysis,
      projectSampleRate,
    ));
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

export async function consolidateProjectMediaSources(
  bridge: MediaImportBridge | null,
): Promise<ProjectMediaConsolidationResult> {
  if (!bridge) {
    return {ok: false, error: 'Media consolidation API is unavailable.'};
  }

  const projectSampleRate = currentEngineSampleRate();
  const resolverResult = await consolidateViaResolver(bridge, projectSampleRate);
  if (resolverResult) {
    return resolverResult;
  }

  if (!bridge.duplicateAudio) {
    return {ok: false, error: 'Media consolidation API is unavailable.'};
  }

  const groups = mediaConsolidationGroups(useDAWStore.getState().blocks);
  if (groups.length === 0) {
    return {ok: true, consolidatedClipCount: 0, failedClipCount: 0};
  }

  const replacements: Array<{blockId: string; media: AudioBlockMediaReplacement}> = [];
  let failedClipCount = 0;

  for (const group of groups) {
    const copied = await bridge.duplicateAudio({path: group.sourcePath});
    if (!copied.ok) {
      failedClipCount += group.blockIds.length;
      continue;
    }

    const prepared = await prepareAudioFileForPlayback(copied);
    if (!prepared) {
      failedClipCount += group.blockIds.length;
      continue;
    }

    const analysis = await analyzeAudioFile(prepared.absolutePath);
    if (!analysis) {
      failedClipCount += group.blockIds.length;
      continue;
    }

    replacements.push(
      ...group.blockIds.map(blockId =>
        replacementMedia(blockId, prepared, analysis, projectSampleRate),
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
