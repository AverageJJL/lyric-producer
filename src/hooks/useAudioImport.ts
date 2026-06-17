import {useCallback, useState} from 'react';

import {
  audioSampleRateWarning,
  createImportedAudioBlock,
  type AudioAnalysis,
} from '../music/audioImport';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {getMediaImportBridge, type AudioImportRequest} from '../native/mediaImportApi';
import {useDAWStore} from '../store/useDAWStore';

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

function analyzeAudioFile(absolutePath: string): AudioAnalysis | null {
  return parseAnalysis(sendNativeAudioCommand('analyze_audio_file', {
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

function firstVoiceTrackId(): string | null {
  return useDAWStore.getState().tracks.find(track => track.type === 'voice_audio')?.id ?? null;
}

function ensureVoiceTrack(): string | null {
  const existing = firstVoiceTrackId();
  if (existing) {
    return existing;
  }
  useDAWStore.getState().addVoiceAudioTrack();
  return firstVoiceTrackId();
}

export function useAudioImport() {
  const [isImporting, setIsImporting] = useState(false);
  const [isRelinking, setIsRelinking] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const importAudioFile = useCallback(async (request?: AudioImportRequest) => {
    const bridge = getMediaImportBridge();
    if (!bridge) {
      setErrorMessage('Media import API is unavailable.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);
    try {
      const imported = request ? await bridge.importAudio(request) : await bridge.importAudio();
      if (!imported.ok) {
        if (!imported.canceled) {
          setErrorMessage(imported.error);
        }
        return;
      }

      const analysis = analyzeAudioFile(imported.absolutePath);
      if (!analysis) {
        setErrorMessage('Imported audio could not be analyzed.');
        return;
      }

      const trackId = ensureVoiceTrack();
      if (!trackId) {
        setErrorMessage('Could not create an audio track.');
        return;
      }

      const state = useDAWStore.getState();
      const trackIndex = Math.max(0, state.tracks.findIndex(track => track.id === trackId));
      const block = createImportedAudioBlock({
        trackId,
        trackIndex,
        startBeat: state.playheadBeat,
        name: imported.name,
        relativePath: imported.relativePath,
        absolutePath: imported.absolutePath,
        analysis,
        projectSampleRate: currentEngineSampleRate(),
      });
      useDAWStore.getState().addBlock(block);
      useDAWStore.getState().selectBlock(block.id);
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

      const analysis = analyzeAudioFile(imported.absolutePath);
      if (!analysis) {
        setErrorMessage('Replacement audio could not be analyzed.');
        return;
      }

      useDAWStore.getState().replaceAudioBlockMedia(blockId, {
        name: block.name || imported.name,
        audioFilePath: imported.relativePath,
        absoluteAudioFilePath: imported.absolutePath,
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

      const analysis = analyzeAudioFile(duplicated.absolutePath);
      if (!analysis) {
        setErrorMessage('Duplicated audio could not be analyzed.');
        return;
      }

      const sourceName = block.mediaSourceName ?? block.name ?? duplicated.name;
      useDAWStore.getState().replaceAudioBlockMedia(blockId, {
        name: block.name,
        audioFilePath: duplicated.relativePath,
        absoluteAudioFilePath: duplicated.absolutePath,
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
