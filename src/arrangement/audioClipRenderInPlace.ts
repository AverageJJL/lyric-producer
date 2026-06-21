import {isDrumPatternBlock} from '../music/clipFactories';
import {audioSampleRateWarning, type AudioAnalysis} from '../music/audioImport';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import type {MediaImportBridge} from '../native/mediaImportApi';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, type DAWBlock} from '../store/useDAWStore';
import {renderNativeMixdown} from './projectNativeMixdownRender';

export type AudioClipRenderInPlaceResult =
  | {ok: true; blockId: string; path: string}
  | {ok: false; error: string};

let renderSequence = 0;

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

function safeNativeCommand(command: string, payload: Record<string, unknown>): string | null {
  try {
    return sendNativeAudioCommand(command, payload);
  } catch {
    return null;
  }
}

async function safeNativeCommandAsync(
  command: string,
  payload: Record<string, unknown>,
): Promise<string | null> {
  try {
    return await sendNativeAudioCommandAsync(command, payload);
  } catch {
    return null;
  }
}

async function analyzeAudioFile(absolutePath: string): Promise<AudioAnalysis | null> {
  const data = parseCommandData(await safeNativeCommandAsync('analyze_audio_file', {
    absoluteAudioFilePath: absolutePath,
  }));
  if (!data || typeof data.durationSeconds !== 'number' || typeof data.sampleRate !== 'number') {
    return null;
  }
  return data as AudioAnalysis;
}

function currentEngineSampleRate(): number | undefined {
  const sampleRate = parseCommandData(safeNativeCommand('engine_status_fast', {}))?.sampleRate;
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0
    ? sampleRate
    : undefined;
}

function selectedAudioClips(): DAWBlock[] {
  const state = useDAWStore.getState();
  const ids = state.selectedBlockIds.length > 0
    ? state.selectedBlockIds
    : state.selectedBlockId ? [state.selectedBlockId] : [];
  const selected = new Set(ids);
  return state.blocks.filter(block =>
    selected.has(block.id) && block.type === 'audio' && !isDrumPatternBlock(block),
  );
}

function renderedBlock(
  clips: DAWBlock[],
  relativePath: string,
  absolutePath: string,
  analysis: AudioAnalysis,
): DAWBlock {
  const first = [...clips].sort((left, right) => left.startBeat - right.startBeat)[0]!;
  const startBeat = Math.min(...clips.map(clip => clip.startBeat));
  const endBeat = Math.max(...clips.map(clip => clip.startBeat + clip.lengthBeats));
  const lengthBeats = Math.max(0.25, endBeat - startBeat);
  renderSequence += 1;
  return {
    id: `${first.id}-render-${Date.now()}-${renderSequence}`,
    trackId: first.trackId,
    name: `${first.name || 'Audio'} Render`,
    startBeat,
    lengthBeats,
    type: 'audio',
    color: first.color,
    sourceLengthBeats: lengthBeats,
    sourceOffsetBeats: 0,
    audioFilePath: relativePath,
    absoluteAudioFilePath: absolutePath,
    waveformPeaks: analysis.waveformPeaks,
    durationSeconds: analysis.durationSeconds,
    sourceSampleRate: analysis.sampleRate,
    sourceChannelCount: analysis.channelCount,
    sourceFileBytes: analysis.fileBytes,
    sourcePeakAmplitude: analysis.peakAmplitude,
    mediaValidationWarning: audioSampleRateWarning(
      analysis.sampleRate,
      currentEngineSampleRate(),
    ),
  };
}

export async function renderSelectedAudioClipsInPlace(
  bridge: MediaImportBridge | null,
): Promise<AudioClipRenderInPlaceResult> {
  if (!bridge?.prepareAudioRender) {
    return {ok: false, error: 'Audio render destination API is unavailable.'};
  }

  const clips = selectedAudioClips();
  if (clips.length === 0) {
    return {ok: false, error: 'Select one or more audio clips to render in place.'};
  }
  const trackId = clips[0]!.trackId;
  if (clips.some(clip => clip.trackId !== trackId)) {
    return {ok: false, error: 'Audio render in place requires clips on one track.'};
  }

  const startBeat = Math.min(...clips.map(clip => clip.startBeat));
  const endBeat = Math.max(...clips.map(clip => clip.startBeat + clip.lengthBeats));
  if (endBeat <= startBeat) {
    return {ok: false, error: 'Selected audio clips have no renderable length.'};
  }

  let destination;
  try {
    destination = await bridge.prepareAudioRender({
      defaultPath: `${clips[0]!.name || 'Audio'} Render.wav`,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not prepare audio render.',
    };
  }
  if (!destination.ok) {
    return {ok: false, error: destination.error};
  }
  if (!destination.absolutePath || !destination.relativePath) {
    return {ok: false, error: 'Audio render destination is incomplete.'};
  }

  let rendered;
  try {
    rendered = await renderNativeMixdown(destination.absolutePath, {
      trackId,
      startBeat,
      endBeat,
    });
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Render in place failed.',
    };
  }
  if (!rendered.ok) {
    return {ok: false, error: rendered.error};
  }

  const analysis = await analyzeAudioFile(destination.absolutePath);
  if (!analysis) {
    return {ok: false, error: 'Rendered audio could not be analyzed.'};
  }

  const nextBlock = renderedBlock(clips, destination.relativePath, destination.absolutePath, analysis);
  const clipIds = new Set(clips.map(clip => clip.id));
  const state = useDAWStore.getState();
  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => {
    let inserted = false;
    return {
      blocks: current.blocks.flatMap(block => {
        if (!clipIds.has(block.id)) {
          return [block];
        }
        if (inserted) {
          return [];
        }
        inserted = true;
        return [nextBlock];
      }),
      selectedBlockId: nextBlock.id,
      selectedBlockIds: [nextBlock.id],
      selectedTrackId: nextBlock.trackId,
      syncSource: 'ui',
    };
  });
  return {ok: true, blockId: nextBlock.id, path: destination.absolutePath};
}
