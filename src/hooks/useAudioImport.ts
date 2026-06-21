import {useCallback, useState} from 'react';

import {
  audioSampleRateWarning,
  createImportedAudioBlock,
  type AudioAnalysis,
} from '../music/audioImport';
import {createTrackFromTemplate} from '../music/trackTemplates';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import {prepareAudioFileForPlayback} from '../native/audioPlaybackPreparation';
import {getMediaImportBridge, type AudioImportRequest} from '../native/mediaImportApi';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';

export type AudioImportPlacement = {
  startBeat?: number;
};

function parseAnalysis(response: string | null): AudioAnalysis | null {
  const data = parseCommandData(response);
  return data ? data as AudioAnalysis : null;
}

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
  return parseAnalysis(await sendNativeAudioCommandAsync('analyze_audio_file', {
    absoluteAudioFilePath: absolutePath,
  }));
}

function currentEngineSampleRate(): number | undefined {
  const data = parseCommandData(sendNativeAudioCommand('engine_status_fast', {}));
  const sampleRate = data?.sampleRate;
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0
    ? sampleRate
    : undefined;
}

function safeImportStartBeat(placement?: AudioImportPlacement): number {
  const startBeat = placement?.startBeat;
  if (typeof startBeat === 'number' && Number.isFinite(startBeat)) {
    return Math.max(0, startBeat);
  }
  return useDAWStore.getState().playheadBeat;
}

export function useAudioImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [isRelinking, setIsRelinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const importAudioFile = useCallback(async (
    request?: AudioImportRequest,
    placement?: AudioImportPlacement,
  ): Promise<DAWBlock | null> => {
    const bridge = getMediaImportBridge();
    if (!bridge) {
      setErrorMessage('Media import API is unavailable.');
      return null;
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const imported = request ? await bridge.importAudio(request) : await bridge.importAudio();
      if (!imported.ok) {
        if (!imported.canceled) {
          setErrorMessage(imported.error);
        }
        return null;
      }

      const prepared = await prepareAudioFileForPlayback(imported);
      if (!prepared) {
        setErrorMessage('Imported audio could not be prepared for playback.');
        return null;
      }

      const analysis = await analyzeAudioFile(prepared.absolutePath);
      if (!analysis) {
        setErrorMessage('Imported audio could not be analyzed.');
        return null;
      }

      const state = useDAWStore.getState();
      const trackIndex = state.tracks.length;
      // A newly imported audio file should feel like a new recorded source: it
      // gets its own lane, while the C++ engine still owns analysis/playback.
      const track = createTrackFromTemplate('voice_audio', trackIndex);
      const block = createImportedAudioBlock({
        trackId: track.id,
        trackIndex,
        startBeat: safeImportStartBeat(placement),
        name: imported.name,
        relativePath: prepared.relativePath,
        absolutePath: prepared.absolutePath,
        analysis,
        projectSampleRate: currentEngineSampleRate(),
      });
      useDAWStore.getState().addTrackWithBlock(track, block);
      return block;
    } finally {
      setIsImporting(false);
    }
  }, []);

  const relinkAudioFile = useCallback(async (blockId: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge) {
      setErrorMessage('Media import API is unavailable.');
      return;
    }

    const block = useDAWStore.getState().blocks.find(item => item.id === blockId);
    if (!block || block.type !== 'audio') {
      setErrorMessage('Select an audio clip to relink.');
      return;
    }

    setIsRelinking(true);
    setErrorMessage(null);
    try {
      const relink = bridge.relinkAudio ?? bridge.importAudio;
      const imported = await relink();
      if (!imported.ok) {
        if (!imported.canceled) {
          setErrorMessage(imported.error);
        }
        return;
      }

      const prepared = await prepareAudioFileForPlayback(imported);
      if (!prepared) {
        setErrorMessage('Replacement audio could not be prepared for playback.');
        return;
      }

      const analysis = await analyzeAudioFile(prepared.absolutePath);
      if (!analysis) {
        setErrorMessage('Replacement audio could not be analyzed.');
        return;
      }

      useDAWStore.getState().replaceAudioBlockMedia(blockId, {
        name: block.name || imported.name,
        audioFilePath: prepared.relativePath,
        absoluteAudioFilePath: prepared.absolutePath,
        lengthBeats: analysis.lengthBeats,
        durationSeconds: analysis.durationSeconds,
        waveformPeaks: analysis.waveformPeaks,
        sourceSampleRate: analysis.sampleRate,
        sourceChannelCount: analysis.channelCount,
        sourceFileBytes: analysis.fileBytes,
        sourcePeakAmplitude: analysis.peakAmplitude,
        mediaValidationWarning: audioSampleRateWarning(
          analysis.sampleRate,
          currentEngineSampleRate(),
        ),
      });
      useDAWStore.getState().selectBlock(blockId);
    } finally {
      setIsRelinking(false);
    }
  }, []);

  const duplicateAudioSource = useCallback(async (blockId: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.duplicateAudio) {
      setErrorMessage('Media duplicate API is unavailable.');
      return;
    }

    const block = useDAWStore.getState().blocks.find(item => item.id === blockId);
    if (!block || block.type !== 'audio' || !block.absoluteAudioFilePath) {
      setErrorMessage('Select a linked audio clip to duplicate.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const duplicated = await bridge.duplicateAudio({path: block.absoluteAudioFilePath});
      if (!duplicated.ok) {
        setErrorMessage(duplicated.error);
        return;
      }

      const prepared = await prepareAudioFileForPlayback(duplicated);
      if (!prepared) {
        setErrorMessage('Duplicated audio could not be prepared for playback.');
        return;
      }

      const analysis = await analyzeAudioFile(prepared.absolutePath);
      if (!analysis) {
        setErrorMessage('Duplicated audio could not be analyzed.');
        return;
      }

      const sourceName = block.mediaSourceName ?? block.name ?? duplicated.name;
      useDAWStore.getState().replaceAudioBlockMedia(blockId, {
        name: block.name,
        audioFilePath: prepared.relativePath,
        absoluteAudioFilePath: prepared.absolutePath,
        mediaSourceName: `${sourceName} Copy`,
        lengthBeats: analysis.lengthBeats,
        durationSeconds: analysis.durationSeconds,
        waveformPeaks: analysis.waveformPeaks,
        sourceSampleRate: analysis.sampleRate,
        sourceChannelCount: analysis.channelCount,
        sourceFileBytes: analysis.fileBytes,
        sourcePeakAmplitude: analysis.peakAmplitude,
        mediaValidationWarning: audioSampleRateWarning(
          analysis.sampleRate,
          currentEngineSampleRate(),
        ),
      });
      useDAWStore.getState().selectBlock(blockId);
    } finally {
      setIsImporting(false);
    }
  }, []);

  const revealAudioFile = useCallback(async (path?: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.revealAudioMedia) {
      setErrorMessage('Media reveal API is unavailable.');
      return;
    }
    setErrorMessage(null);
    const revealed = await bridge.revealAudioMedia({path});
    if (!revealed.ok) {
      setErrorMessage(revealed.error);
    }
  }, []);

  return {
    importAudioFile,
    relinkAudioFile,
    duplicateAudioSource,
    revealAudioFile,
    isImporting,
    isRelinking,
    errorMessage,
  };
}
