/**
 * Audio-clip resolution + measurement-window math for the read-only Ask audio tools
 * (electron/askAudioTools.ts). Split out to keep that file under the line budget.
 *
 * The key job here is turning a `.apc` audio clip into the SEGMENT the user is actually
 * asking about: a clip is a trimmed/gained/faded window into a source WAV. We pass the
 * clip's BEAT geometry (source offset, audible length, gain, fades, reverse) to the engine
 * and let it convert beats->source-seconds through the same tempo sequence playback uses,
 * so the measured region matches what is heard under tempo maps and reverse. For masking
 * we measure only the time the two clips overlap (optionally narrowed by a beat range).
 */

import type {ApcAgentTree} from './copilotAgentTools';

/** Synchronous native bridge: (command, payloadJson) -> JSON response string. */
export type NativeCommandFn = (command: string, payloadJson: string) => string;

export type SpectrumBand = {lowHz: number; highHz: number; energyDb: number};

/** The clip's beat geometry; the engine converts it to a source-seconds window. */
export type ClipBeatWindow = {
  startBeat: number;
  lengthBeats: number; // 0 means "the whole file"
  sourceOffsetBeats: number;
  sourceLengthBeats: number;
  clipGainDb: number;
  fadeInBeats: number;
  fadeOutBeats: number;
  isReversed: boolean;
};

type ClipFile = {
  id?: string;
  name?: string;
  type?: string;
  audioFilePath?: string;
  mediaSourceName?: string;
  startBeat?: number;
  lengthBeats?: number;
  sourceOffsetBeats?: number;
  sourceLengthBeats?: number;
  clipGainDb?: number;
  fadeInBeats?: number;
  fadeOutBeats?: number;
  isReversed?: boolean;
};

export type AudioClip = {clip: ClipFile; path: string};

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function findClip(tree: ApcAgentTree, clipId: string): ClipFile | null {
  for (const entry of tree.index) {
    if (!entry.path.startsWith('clips/') || !entry.path.endsWith('.json')) {
      continue;
    }
    const raw = tree.files[entry.path];
    if (typeof raw !== 'string') {
      continue;
    }
    try {
      const clip = JSON.parse(raw) as ClipFile;
      if (clip.id === clipId) {
        return clip;
      }
    } catch {
      // ignore malformed
    }
  }
  return null;
}

export function audioClip(tree: ApcAgentTree, clipId: string): {ok: true; value: AudioClip} | {ok: false; reason: string} {
  const clip = findClip(tree, clipId);
  if (!clip) {
    return {ok: false, reason: `No clip with id "${clipId}".`};
  }
  if (clip.type !== 'audio' || typeof clip.audioFilePath !== 'string' || clip.audioFilePath.length === 0) {
    return {ok: false, reason: `Clip "${clip.name ?? clipId}" has no audio to measure (only audio clips can be measured).`};
  }
  return {ok: true, value: {clip, path: clip.audioFilePath}};
}

/** The clip's full audible segment as beat geometry for the engine to convert. */
export function clipWindow(clip: ClipFile): ClipBeatWindow {
  const lengthBeats = Math.max(0, num(clip.lengthBeats));
  return {
    startBeat: num(clip.startBeat),
    lengthBeats,
    sourceOffsetBeats: Math.max(0, num(clip.sourceOffsetBeats)),
    sourceLengthBeats: Math.max(lengthBeats, num(clip.sourceLengthBeats, lengthBeats)),
    clipGainDb: num(clip.clipGainDb),
    fadeInBeats: Math.max(0, num(clip.fadeInBeats)),
    fadeOutBeats: Math.max(0, num(clip.fadeOutBeats)),
    isReversed: clip.isReversed === true,
  };
}

/**
 * Windows for masking: the source region of each clip that plays during the two clips'
 * timeline overlap (optionally narrowed by an explicit beat range), as beat geometry.
 * Returns 'full' when the clips carry no timeline position (analyze them whole), 'none'
 * when they never play together, else the per-clip sub-windows.
 */
export function maskingWindows(
  a: ClipFile,
  b: ClipFile,
  startBeat?: number,
  endBeat?: number,
): {kind: 'full'} | {kind: 'none'; reason: string} | {kind: 'pair'; a: ClipBeatWindow; b: ClipBeatWindow} {
  const positioned = [a, b].every(clip => typeof clip.startBeat === 'number' && typeof clip.lengthBeats === 'number');
  if (!positioned) {
    return {kind: 'full'};
  }
  const aStart = num(a.startBeat);
  const bStart = num(b.startBeat);
  const overlapStart = Math.max(aStart, bStart, typeof startBeat === 'number' ? startBeat : -Infinity);
  const overlapEnd = Math.min(
    aStart + num(a.lengthBeats),
    bStart + num(b.lengthBeats),
    typeof endBeat === 'number' ? endBeat : Infinity,
  );
  if (overlapEnd <= overlapStart) {
    return {kind: 'none', reason: 'These clips do not overlap in time, so neither can mask the other.'};
  }
  const overlapLength = overlapEnd - overlapStart;
  // A sub-window keeps the clip's source geometry but starts deeper into the source by how
  // far past the clip's own start the overlap begins; the engine clamps + tempo-maps it.
  const sub = (clip: ClipFile, clipStart: number): ClipBeatWindow => {
    const full = clipWindow(clip);
    return {
      ...full,
      startBeat: overlapStart,
      lengthBeats: overlapLength,
      sourceOffsetBeats: Math.max(0, full.sourceOffsetBeats + (overlapStart - clipStart)),
      fadeInBeats: 0, // interior slices: clip-boundary fades rarely apply
      fadeOutBeats: 0,
    };
  };
  return {kind: 'pair', a: sub(a, aStart), b: sub(b, bStart)};
}

/** Call a native command and unwrap the {ok,data}/{ok,error} envelope. Never throws. */
export function callNative<T>(send: NativeCommandFn, command: string, payload: unknown): {ok: true; data: T} | {ok: false; reason: string} {
  let raw: string;
  try {
    raw = send(command, JSON.stringify(payload));
  } catch (error) {
    return {ok: false, reason: error instanceof Error ? error.message : 'native bridge error'};
  }
  try {
    const parsed = JSON.parse(raw) as {ok?: boolean; data?: T; error?: {code?: string; message?: string}};
    if (parsed && parsed.ok && parsed.data) {
      return {ok: true, data: parsed.data};
    }
    const reason = parsed?.error?.code === 'unknown_command'
      ? 'the engine in this build does not support audio measurement yet'
      : parsed?.error?.message ?? 'measurement unavailable';
    return {ok: false, reason};
  } catch {
    return {ok: false, reason: 'malformed measurement response'};
  }
}

export function getBands(send: NativeCommandFn, path: string, window: ClipBeatWindow): {ok: true; bands: SpectrumBand[]} | {ok: false; reason: string} {
  const res = callNative<{bands?: unknown}>(send, 'get_spectrum_bands', {audioPath: path, loudnessMatch: true, ...window});
  if (!res.ok) {
    return res;
  }
  const bands = Array.isArray(res.data.bands)
    ? (res.data.bands as Array<Record<string, unknown>>).map(band => ({
        lowHz: num(band.lowHz),
        highHz: num(band.highHz),
        energyDb: num(band.energyDb, -120),
      }))
    : [];
  if (bands.length === 0) {
    return {ok: false, reason: 'no spectral bands returned'};
  }
  return {ok: true, bands};
}

export function fmtDb(db: number): string {
  return `${db >= 0 ? '+' : ''}${db.toFixed(1)} dB`;
}

export function bandLabel(band: SpectrumBand): string {
  const hz = (value: number) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : `${Math.round(value)}`);
  return `${hz(band.lowHz)}–${hz(band.highHz)}Hz`;
}

export function alignedBandDeltas(a: SpectrumBand[], b: SpectrumBand[]): Array<{band: SpectrumBand; deltaDb: number}> {
  const count = Math.min(a.length, b.length);
  const out: Array<{band: SpectrumBand; deltaDb: number}> = [];
  for (let i = 0; i < count; i += 1) {
    out.push({band: a[i], deltaDb: b[i].energyDb - a[i].energyDb});
  }
  return out;
}
