import type {ApcPatchTransaction} from './copilotAgentContract';
import type {ApcAgentTree} from './copilotAgentTools';
import {buildAudioArrangementShortcut} from './copilotBuildAudioArrangement';

type ClipFile = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  trackId?: unknown;
  startBeat?: unknown;
  lengthBeats?: unknown;
  audioFilePath?: unknown;
  absoluteAudioFilePath?: unknown;
};

type TrackFile = {id?: unknown; name?: unknown};
type TimelineFile = {
  timeSignature?: {numerator?: unknown; denominator?: unknown};
  sections?: unknown;
};

type Section = {id: string; name: string; startBeat: number; lengthBeats: number};

export type CopilotBuildShortcutResult = {
  text: string;
  patch: ApcPatchTransaction;
};

function readJson<T>(tree: ApcAgentTree, path: string): T | null {
  try {
    return JSON.parse(tree.files[path] ?? 'null') as T;
  } catch {
    return null;
  }
}

function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function wantsSectionMap(message: string): boolean {
  const text = message.toLowerCase();
  const structure = /\b(structure|section|sections|marker|markers|arrangement map)\b/.test(text);
  const sourceBound = /\b(audio block|current audio|source of truth|without generating|no new music|existing clip)\b/.test(text);
  return structure && sourceBound;
}

function audioClips(tree: ApcAgentTree) {
  return Object.keys(tree.files)
    .filter(path => path.startsWith('clips/') && path.endsWith('.json'))
    .map(path => ({path, clip: readJson<ClipFile>(tree, path)}))
    .map(({path, clip}) => {
      const id = cleanString(clip?.id);
      const name = cleanString(clip?.name) ?? id;
      const trackId = cleanString(clip?.trackId);
      const startBeat = finiteNumber(clip?.startBeat);
      const lengthBeats = finiteNumber(clip?.lengthBeats);
      const fileBacked = Boolean(cleanString(clip?.audioFilePath) ?? cleanString(clip?.absoluteAudioFilePath));
      return clip?.type === 'audio' && id && name && trackId && startBeat !== null && lengthBeats && fileBacked
        ? {path, id, name, trackId, startBeat, lengthBeats}
        : null;
    })
    .filter((clip): clip is NonNullable<typeof clip> => clip !== null)
    .sort((a, b) => a.startBeat - b.startBeat);
}

function validSections(value: unknown): Section[] {
  return Array.isArray(value)
    ? value.filter((item): item is Section => {
      const section = item as Section;
      return cleanString(section.id) !== null &&
        cleanString(section.name) !== null &&
        finiteNumber(section.startBeat) !== null &&
        finiteNumber(section.lengthBeats) !== null &&
        section.lengthBeats > 0;
    })
    : [];
}

function barBeats(timeline: TimelineFile): number {
  const numerator = finiteNumber(timeline.timeSignature?.numerator);
  return numerator && numerator > 0 ? numerator : 4;
}

function snapToBar(beat: number, grid: number): number {
  return Math.max(0, Math.round(beat / grid) * grid);
}

function sectionStarts(startBeat: number, lengthBeats: number, grid: number): number[] {
  const fractions = lengthBeats >= grid * 24 ? [0, 0.14, 0.4, 0.66, 0.88, 1] : [0, 0.33, 0.66, 1];
  return fractions
    .map((fraction, index) => {
      const raw = startBeat + lengthBeats * fraction;
      return index === 0 || index === fractions.length - 1 ? raw : snapToBar(raw, grid);
    })
    .filter((beat, index, beats) => index === 0 || beat > beats[index - 1] + 0.000001);
}

function uniqueSectionId(base: string, used: Set<string>): string {
  let id = base;
  let suffix = 2;
  while (used.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function trackName(tree: ApcAgentTree, trackId: string): string {
  const track = readJson<TrackFile>(tree, `tracks/${encodeURIComponent(trackId)}.json`);
  return cleanString(track?.name) ?? trackId;
}

function buildSections(tree: ApcAgentTree, prefix: string, usedIds: Set<string>): Section[] {
  const [clip] = audioClips(tree);
  if (!clip) {
    return [];
  }
  const timeline = readJson<TimelineFile>(tree, 'timeline.json') ?? {};
  const labels = ['Intro / source check', 'Main A', 'Main B', 'Lift / peak check', 'Outro / tail'];
  const starts = sectionStarts(clip.startBeat, clip.lengthBeats, barBeats(timeline));
  return starts.slice(0, -1).map((startBeat, index) => ({
    id: uniqueSectionId(`${prefix}-${index + 1}`, usedIds),
    name: labels[index] ?? `Section ${index + 1}`,
    startBeat,
    lengthBeats: starts[index + 1] - startBeat,
  }));
}

export function buildBlockStructureShortcut(message: string, tree: ApcAgentTree): CopilotBuildShortcutResult | null {
  const audioArrangement = buildAudioArrangementShortcut(message, tree);
  if (audioArrangement) {
    return audioArrangement;
  }
  if (!wantsSectionMap(message)) {
    return null;
  }
  const timelineHash = tree.index.find(entry => entry.path === 'timeline.json')?.contentHash;
  const timeline = readJson<TimelineFile>(tree, 'timeline.json');
  const [clip] = audioClips(tree);
  if (!timelineHash || !timeline || !clip) {
    return null;
  }

  const prefix = `ai-structure-${clip.id.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 36)}`;
  const kept = validSections(timeline.sections).filter(section => !section.id.startsWith(prefix));
  const usedIds = new Set(kept.map(section => section.id));
  const sections = buildSections(tree, prefix, usedIds);
  if (sections.length === 0) {
    return null;
  }

  const text = [
    `Prepared a ${sections.length}-section arrangement map from "${clip.name}" on ${trackName(tree, clip.trackId)}.`,
    'No audio, MIDI, or media was generated; this only adds timeline section metadata for staging.',
  ].join(' ');

  return {
    text,
    patch: {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: `Create section map for ${clip.name}`,
      changes: [{
        op: 'mergeFields',
        path: 'timeline.json',
        beforeHash: timelineHash,
        fields: {sections: [...kept, ...sections]},
      }],
    },
  };
}
