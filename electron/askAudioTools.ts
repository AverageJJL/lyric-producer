/**
 * Read-only "Ask" tools that need real audio measurement: loudness, masking, and
 * reference low-end comparison. They never touch audio in JS — they ask the C++ engine
 * (via a synchronous native command) to measure the clip's audible SEGMENT (trim, gain,
 * fades) and return JSON numbers, then do plain arithmetic over those numbers to shape an
 * answer + AskReport. Clip resolution + window math live in electron/askAudioSource.ts.
 *
 * If the running engine does not implement the commands yet (or cannot read the file),
 * the tool returns {available:false, reason} so the model explains the gap instead of
 * inventing values.
 */

import type {ApcAgentTree} from './copilotAgentTools';
import type {AskReport, AskReportBar, AskToolResult} from './askReportTypes';
import {
  alignedBandDeltas,
  audioClip,
  bandLabel,
  callNative,
  clipWindow,
  fmtDb,
  getBands,
  maskingWindows,
  num,
  type NativeCommandFn,
} from './askAudioSource';

export type {NativeCommandFn} from './askAudioSource';

function measureLoudness(tree: ApcAgentTree, send: NativeCommandFn, args: Record<string, unknown>): AskToolResult {
  const clipId = String(args.clipId ?? '');
  const located = audioClip(tree, clipId);
  if (!located.ok) {
    return {result: {available: false, reason: located.reason}};
  }
  const {clip, path} = located.value;
  const res = callNative<Record<string, unknown>>(send, 'measure_loudness', {audioPath: path, ...clipWindow(clip)});
  if (!res.ok) {
    return {result: {available: false, clip: clip.name, reason: res.reason}};
  }
  const d = res.data;
  const integrated = num(d.integratedLufs, NaN);
  const shortTerm = num(d.shortTermLufs, NaN);
  const rms = num(d.rmsDb, NaN);
  const peak = num(d.peakDb, NaN);
  const metric = (label: string, value: number, unit: string) =>
    Number.isFinite(value) ? [{label, value: `${value.toFixed(1)} ${unit}`}] : [];
  const report: AskReport = {
    id: `ask-loudness-${clipId}`,
    kind: 'loudness',
    title: `Loudness · ${clip.name ?? clipId}`,
    headline: Number.isFinite(integrated)
      ? `Integrated ${integrated.toFixed(1)} LUFS, peak ${Number.isFinite(peak) ? peak.toFixed(1) : '–'} dB`
      : 'Measured loudness for this clip.',
    metrics: [
      ...metric('Integrated', integrated, 'LUFS'),
      ...metric('Short-term', shortTerm, 'LUFS'),
      ...metric('RMS', rms, 'dB'),
      ...metric('Peak', peak, 'dBFS'),
    ],
  };
  return {result: {available: true, clip: clip.name, ...d}, report};
}

function analyzeMasking(tree: ApcAgentTree, send: NativeCommandFn, args: Record<string, unknown>): AskToolResult {
  const a = audioClip(tree, String(args.clipIdA ?? ''));
  const b = audioClip(tree, String(args.clipIdB ?? ''));
  if (!a.ok) return {result: {available: false, reason: a.reason}};
  if (!b.ok) return {result: {available: false, reason: b.reason}};
  const startBeat = typeof args.startBeat === 'number' ? args.startBeat : undefined;
  const endBeat = typeof args.endBeat === 'number' ? args.endBeat : undefined;
  const windows = maskingWindows(a.value.clip, b.value.clip, startBeat, endBeat);
  if (windows.kind === 'none') {
    return {result: {available: false, reason: windows.reason}};
  }
  const winA = windows.kind === 'pair' ? windows.a : clipWindow(a.value.clip);
  const winB = windows.kind === 'pair' ? windows.b : clipWindow(b.value.clip);
  const bandsA = getBands(send, a.value.path, winA);
  if (!bandsA.ok) return {result: {available: false, reason: bandsA.reason}};
  const bandsB = getBands(send, b.value.path, winB);
  if (!bandsB.ok) return {result: {available: false, reason: bandsB.reason}};

  // Loudness-matched: rank bands by how much louder B is than A where A has real energy.
  const deltas = alignedBandDeltas(bandsA.bands, bandsB.bands)
    .filter(entry => entry.band.energyDb > -60)
    .sort((x, y) => y.deltaDb - x.deltaDb);
  const worst = deltas.slice(0, 8);
  const bars: AskReportBar[] = worst.map(entry => ({
    label: bandLabel(entry.band),
    value: `B ${fmtDb(entry.deltaDb)}`,
    level: Math.min(1, Math.max(0, (entry.deltaDb + 12) / 24)),
  }));
  const top = worst[0];
  const nameA = a.value.clip.name ?? 'A';
  const nameB = b.value.clip.name ?? 'B';
  const report: AskReport = {
    id: 'ask-masking',
    kind: 'masking',
    title: `Masking · ${nameB} over ${nameA}`,
    headline: top
      ? `Strongest overlap around ${bandLabel(top.band)} (${nameB} ${fmtDb(top.deltaDb)} vs ${nameA}).`
      : 'No significant spectral overlap found.',
    metrics: [{label: 'Bands compared', value: String(Math.min(bandsA.bands.length, bandsB.bands.length))}],
    bars: bars.length > 0 ? bars : undefined,
    note: 'Loudness-matched over the clips’ overlapping time. Positive = the second clip is louder in that band.',
  };
  return {result: {available: true, bands: worst.map(e => ({band: bandLabel(e.band), deltaDb: Number(e.deltaDb.toFixed(2))}))}, report};
}

function compareReference(tree: ApcAgentTree, send: NativeCommandFn, args: Record<string, unknown>): AskToolResult {
  const project = audioClip(tree, String(args.projectClipId ?? ''));
  const reference = audioClip(tree, String(args.referenceClipId ?? ''));
  if (!project.ok) return {result: {available: false, reason: project.reason}};
  if (!reference.ok) return {result: {available: false, reason: reference.reason}};
  const crossover = num(args.crossoverHz, 200);
  const bandsP = getBands(send, project.value.path, clipWindow(project.value.clip));
  if (!bandsP.ok) return {result: {available: false, reason: bandsP.reason}};
  const bandsR = getBands(send, reference.value.path, clipWindow(reference.value.clip));
  if (!bandsR.ok) return {result: {available: false, reason: bandsR.reason}};

  const low = alignedBandDeltas(bandsP.bands, bandsR.bands).filter(entry => entry.band.highHz <= crossover * 1.5 && entry.band.lowHz < crossover);
  const bars: AskReportBar[] = low.map(entry => ({
    label: bandLabel(entry.band),
    value: `you ${fmtDb(-entry.deltaDb)}`,
    level: Math.min(1, Math.max(0, (-entry.deltaDb + 12) / 24)),
  }));
  const avgDelta = low.length > 0 ? low.reduce((sum, e) => sum + -e.deltaDb, 0) / low.length : 0;
  const report: AskReport = {
    id: 'ask-reference',
    kind: 'reference',
    title: `Low-end vs ${reference.value.clip.name ?? 'reference'}`,
    headline: low.length > 0
      ? `Below ${Math.round(crossover)} Hz your clip is on average ${fmtDb(avgDelta)} vs the reference.`
      : 'No low bands below the crossover to compare.',
    metrics: [
      {label: 'Crossover', value: `${Math.round(crossover)} Hz`},
      {label: 'Avg low Δ', value: fmtDb(avgDelta)},
    ],
    bars: bars.length > 0 ? bars : undefined,
    note: 'Loudness-matched. Positive = your clip has more energy than the reference in that band.',
  };
  return {result: {available: true, crossoverHz: crossover, averageLowDeltaDb: Number(avgDelta.toFixed(2)), bands: low.map(e => ({band: bandLabel(e.band), youMinusRefDb: Number((-e.deltaDb).toFixed(2))}))}, report};
}

/** Dispatch a measurement Ask tool. Returns null when `name` is not an audio tool. */
export function runAskAudioTool(
  tree: ApcAgentTree,
  send: NativeCommandFn | undefined,
  name: string,
  args: Record<string, unknown>,
): AskToolResult | null {
  const audioNames = new Set(['measure_loudness', 'analyze_masking', 'compare_reference_low_end']);
  if (!audioNames.has(name)) {
    return null;
  }
  if (!send) {
    return {result: {available: false, reason: 'the audio engine is not available in this context'}};
  }
  switch (name) {
    case 'measure_loudness':
      return measureLoudness(tree, send, args);
    case 'analyze_masking':
      return analyzeMasking(tree, send, args);
    case 'compare_reference_low_end':
      return compareReference(tree, send, args);
    default:
      return null;
  }
}
