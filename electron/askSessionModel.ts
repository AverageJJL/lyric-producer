/**
 * Pure `.apc`-tree parsing helpers shared by the read-only Ask session-model tools
 * (electron/askAnalysisTools.ts). Split out to keep that file under the 300-line budget
 * and to keep the tree-reading primitives unit-testable on their own.
 */

import type {ApcAgentTree} from './copilotAgentTools';

export type ClipFile = {
  id?: string;
  trackId?: string;
  name?: string;
  type?: string;
  startBeat?: number;
  lengthBeats?: number;
  notes?: unknown[];
  patternId?: string;
  mediaSourceName?: string;
  durationSeconds?: number;
};

export type TrackFile = {id?: string; name?: string; type?: string};

export function num(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function readJson<T>(tree: ApcAgentTree, path: string): T | null {
  const raw = tree.files[path];
  if (typeof raw !== 'string') {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function entriesByPrefix<T>(tree: ApcAgentTree, prefix: string): Array<{path: string; data: T}> {
  const out: Array<{path: string; data: T}> = [];
  for (const entry of tree.index) {
    if (entry.path.startsWith(prefix) && entry.path.endsWith('.json')) {
      const data = readJson<T>(tree, entry.path);
      if (data) {
        out.push({path: entry.path, data});
      }
    }
  }
  return out;
}

export function clipEnd(clip: ClipFile): number {
  return num(clip.startBeat) + Math.max(0, num(clip.lengthBeats));
}

export function activeStepCount(steps: unknown): number {
  if (!steps || typeof steps !== 'object') {
    return 0;
  }
  let count = 0;
  for (const row of Object.values(steps as Record<string, unknown>)) {
    if (Array.isArray(row)) {
      count += row.filter(Boolean).length;
    }
  }
  return count;
}

export function trackMap(tree: ApcAgentTree): Map<string, TrackFile> {
  const map = new Map<string, TrackFile>();
  for (const {data} of entriesByPrefix<TrackFile>(tree, 'tracks/')) {
    if (typeof data.id === 'string') {
      map.set(data.id, data);
    }
  }
  return map;
}

export function projectLengthBeats(clips: ClipFile[]): number {
  return clips.reduce((max, clip) => Math.max(max, clipEnd(clip)), 0);
}

/** Merge [start,end) intervals and return total covered length. */
export function coveredBeats(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) {
    return 0;
  }
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i += 1) {
    const [start, end] = sorted[i];
    if (start > curEnd) {
      total += curEnd - curStart;
      curStart = start;
      curEnd = end;
    } else {
      curEnd = Math.max(curEnd, end);
    }
  }
  total += curEnd - curStart;
  return total;
}

export function beatsToBars(beats: number, beatsPerBar: number): string {
  if (beatsPerBar <= 0) {
    return `${beats.toFixed(0)} beats`;
  }
  return `${(beats / beatsPerBar).toFixed(1)} bars`;
}
