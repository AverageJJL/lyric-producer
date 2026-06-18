/**
 * Read-only "Ask" tools that answer from the `.apc` project tree alone (no audio): session
 * summary, clip search, and arrangement density. Pure functions over the sanitized
 * ApcAgentTree — same trust model as electron/copilotAgentTools.ts, so they unit-test
 * directly with a hand-built tree and need no mocks. Tree-parsing primitives live in
 * electron/askSessionModel.ts.
 *
 * Each tool returns {result} for the model plus an {report} AskReport card for the panel.
 */

import type {ApcAgentTree} from './copilotAgentTools';
import type {AskReport, AskReportBar, AskToolResult} from './askReportTypes';
import {
  activeStepCount,
  beatsToBars,
  clipEnd,
  coveredBeats,
  entriesByPrefix,
  num,
  projectLengthBeats,
  readJson,
  trackMap,
  type ClipFile,
} from './askSessionModel';

export type {AskToolResult} from './askReportTypes';

function sessionSummary(tree: ApcAgentTree): AskToolResult {
  const project = readJson<Record<string, unknown>>(tree, 'project.json') ?? {};
  const timeline = readJson<Record<string, unknown>>(tree, 'timeline.json') ?? {};
  const clips = entriesByPrefix<ClipFile>(tree, 'clips/').map(item => item.data);
  const tracks = entriesByPrefix<{type?: string}>(tree, 'tracks/').map(item => item.data);
  const patterns = entriesByPrefix(tree, 'patterns/').length;

  const timeSig = (timeline.timeSignature as {numerator?: number; denominator?: number}) ?? {};
  const beatsPerBar = num(timeSig.numerator, 4) * (4 / num(timeSig.denominator, 4));
  const scale = project.scale as {root?: string; mode?: string} | null;
  const sections = Array.isArray(timeline.sections) ? (timeline.sections as Array<{name?: string}>) : [];
  const length = projectLengthBeats(clips);

  const typeCounts = new Map<string, number>();
  for (const track of tracks) {
    const key = typeof track.type === 'string' ? track.type : 'unknown';
    typeCounts.set(key, (typeCounts.get(key) ?? 0) + 1);
  }
  const breakdown = [...typeCounts.entries()].map(([type, count]) => `${count} ${type}`).join(', ');

  const result = {
    trackCount: tracks.length,
    clipCount: clips.length,
    patternCount: patterns,
    bpm: num(project.bpm, 0),
    timeSignature: `${num(timeSig.numerator, 4)}/${num(timeSig.denominator, 4)}`,
    key: scale && scale.root ? `${scale.root} ${scale.mode ?? ''}`.trim() : 'none set',
    projectLengthBeats: length,
    sectionCount: sections.length,
    sections: sections.map(section => section.name).filter(Boolean),
    trackTypeBreakdown: breakdown,
  };

  const report: AskReport = {
    id: 'ask-summary',
    kind: 'summary',
    title: 'Session summary',
    headline: `${tracks.length} tracks, ${clips.length} clips · ${result.bpm || '–'} BPM ${result.timeSignature} · ${beatsToBars(length, beatsPerBar)}`,
    metrics: [
      {label: 'Tracks', value: String(tracks.length), hint: breakdown || undefined},
      {label: 'Clips', value: String(clips.length)},
      {label: 'Patterns', value: String(patterns)},
      {label: 'Tempo', value: result.bpm ? `${result.bpm} BPM` : '–'},
      {label: 'Time sig', value: result.timeSignature},
      {label: 'Key', value: result.key},
      {label: 'Length', value: beatsToBars(length, beatsPerBar)},
      {label: 'Sections', value: String(sections.length)},
    ],
  };
  return {result, report};
}

function findClips(tree: ApcAgentTree, args: Record<string, unknown>): AskToolResult {
  const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
  const trackId = typeof args.trackId === 'string' ? args.trackId : null;
  const typeFilter = args.type === 'midi' || args.type === 'audio' ? args.type : null;
  const minBeat = typeof args.minBeat === 'number' ? args.minBeat : null;
  const maxBeat = typeof args.maxBeat === 'number' ? args.maxBeat : null;
  const cap = Math.min(typeof args.maxResults === 'number' ? args.maxResults : 40, 40);

  const tracks = trackMap(tree);
  const clips = entriesByPrefix<ClipFile>(tree, 'clips/').map(item => item.data);
  const length = projectLengthBeats(clips);

  const matches = clips.filter(clip => {
    if (trackId && clip.trackId !== trackId) {
      return false;
    }
    if (typeFilter && clip.type !== typeFilter) {
      return false;
    }
    if (query) {
      const haystack = `${clip.name ?? ''} ${clip.mediaSourceName ?? ''}`.toLowerCase();
      if (!haystack.includes(query)) {
        return false;
      }
    }
    if (minBeat !== null && clipEnd(clip) <= minBeat) {
      return false;
    }
    if (maxBeat !== null && num(clip.startBeat) >= maxBeat) {
      return false;
    }
    return true;
  });

  const shaped = matches.slice(0, cap).map(clip => ({
    id: clip.id,
    name: clip.name ?? '(unnamed)',
    trackId: clip.trackId,
    trackName: clip.trackId ? tracks.get(clip.trackId)?.name ?? clip.trackId : undefined,
    type: clip.type,
    startBeat: num(clip.startBeat),
    lengthBeats: num(clip.lengthBeats),
    noteCount: Array.isArray(clip.notes) ? clip.notes.length : undefined,
    patternId: clip.patternId,
    mediaSourceName: clip.mediaSourceName,
    durationSeconds: clip.durationSeconds,
  }));

  const bars: AskReportBar[] = shaped.slice(0, 12).map(clip => ({
    label: clip.trackName ? `${clip.name} · ${clip.trackName}` : clip.name,
    value: `${clip.startBeat.toFixed(1)}–${(clip.startBeat + clip.lengthBeats).toFixed(1)}`,
    level: length > 0 ? Math.min(1, clip.lengthBeats / length) : 0,
  }));

  const report: AskReport = {
    id: 'ask-clips',
    kind: 'clips',
    title: query ? `Clips matching “${query}”` : 'Clips',
    headline: `${matches.length} clip${matches.length === 1 ? '' : 's'} matched${matches.length > cap ? ` (showing ${cap})` : ''}`,
    metrics: [{label: 'Matches', value: String(matches.length)}],
    bars: bars.length > 0 ? bars : undefined,
  };
  return {result: {matchCount: matches.length, clips: shaped}, report};
}

function arrangementDensity(tree: ApcAgentTree): AskToolResult {
  const tracks = trackMap(tree);
  const clips = entriesByPrefix<ClipFile>(tree, 'clips/').map(item => item.data);
  const length = projectLengthBeats(clips);

  type Agg = {name: string; type: string; intervals: Array<[number, number]>; content: number};
  const byTrack = new Map<string, Agg>();
  const patternSteps = new Map<string, number>();
  for (const {data} of entriesByPrefix<{id?: string; steps?: unknown}>(tree, 'patterns/')) {
    if (typeof data.id === 'string') {
      patternSteps.set(data.id, activeStepCount(data.steps));
    }
  }

  for (const clip of clips) {
    const id = clip.trackId ?? 'unassigned';
    const track = clip.trackId ? tracks.get(clip.trackId) : undefined;
    const agg = byTrack.get(id) ?? {name: track?.name ?? id, type: track?.type ?? 'unknown', intervals: [], content: 0};
    agg.intervals.push([num(clip.startBeat), clipEnd(clip)]);
    if (Array.isArray(clip.notes)) {
      agg.content += clip.notes.length;
    } else if (clip.patternId) {
      const bars = Math.max(1, Math.round(num(clip.lengthBeats) / 4));
      agg.content += (patternSteps.get(clip.patternId) ?? 0) * bars;
    }
    byTrack.set(id, agg);
  }

  const rows = [...byTrack.values()].map(agg => {
    const covered = coveredBeats(agg.intervals);
    const fill = length > 0 ? covered / length : 0;
    return {
      track: agg.name,
      type: agg.type,
      filledBeats: Number(covered.toFixed(2)),
      fillFraction: Number(fill.toFixed(3)),
      events: agg.content,
      eventsPerFilledBeat: covered > 0 ? Number((agg.content / covered).toFixed(2)) : 0,
    };
  }).sort((a, b) => b.fillFraction - a.fillFraction);

  const bars: AskReportBar[] = rows.slice(0, 16).map(row => ({
    label: row.track,
    value: `${Math.round(row.fillFraction * 100)}% · ${row.events} ev`,
    level: row.fillFraction,
  }));

  const densest = rows[0];
  const sparsest = rows[rows.length - 1];
  const report: AskReport = {
    id: 'ask-density',
    kind: 'density',
    title: 'Arrangement density',
    headline: densest
      ? `Densest: ${densest.track} (${Math.round(densest.fillFraction * 100)}% filled). Sparsest: ${sparsest.track} (${Math.round(sparsest.fillFraction * 100)}%).`
      : 'No clips to measure yet.',
    metrics: [
      {label: 'Tracks with clips', value: String(rows.length)},
      {label: 'Project length', value: `${length.toFixed(1)} beats`},
    ],
    bars: bars.length > 0 ? bars : undefined,
  };
  return {result: {projectLengthBeats: length, tracks: rows}, report};
}

/** Dispatch a session-model Ask tool. Returns null when `name` is not handled here. */
export function runAskSessionTool(
  tree: ApcAgentTree,
  name: string,
  args: Record<string, unknown>,
): AskToolResult | null {
  switch (name) {
    case 'get_session_summary':
      return sessionSummary(tree);
    case 'find_clips':
      return findClips(tree, args);
    case 'analyze_arrangement_density':
      return arrangementDensity(tree);
    default:
      return null;
  }
}
