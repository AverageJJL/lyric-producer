import {AGENT_PATCH_MAX_CHANGES, type ApcPatchTransaction} from './copilotAgentContract';
import type {ApcAgentTree} from './copilotAgentTools';
import {clipsForSections} from './copilotBuildAudioArrangementClips';
import {
  cleanString,
  readJson,
  roundBeat,
  slug,
  sourceClips,
  treeHash,
  type Section,
  type SectionSpec,
  type SourceClip,
  type TimelineFile,
} from './copilotBuildAudioArrangementSource';
import type {CopilotBuildShortcutResult} from './copilotBuildShortcuts';
import {barDisplayRangeToBeats} from './copilotSectionMarkerParser';

type TrackFile = Record<string, unknown> & {id?: unknown; name?: unknown};

function normalized(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function labelContains(label: string, target: string): boolean {
  const haystack = normalized(label);
  const needle = normalized(target);
  return needle.length > 0 && (haystack.includes(needle) || needle.includes(haystack));
}

function baseName(value: unknown): string | null {
  const path = cleanString(value);
  return path ? cleanString(path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '')) : null;
}

function sourceLabels(source: SourceClip): string[] {
  return [
    source.trackName,
    source.trackId,
    source.name,
    baseName(source.clip.audioFilePath),
    baseName(source.clip.absoluteAudioFilePath),
  ].filter((label): label is string => Boolean(label));
}

function replaceTarget(message: string): string | null {
  const patterns = [
    /\breplace\s+(?:the\s+)?(?:full[- ]length\s+|original\s+)?([A-Za-z0-9_ &/-]{2,60}?)\s+(?:stem|track|lane|clip)\b/i,
    /\bexisting\s+audio\s+from\s+(?:the\s+)?([A-Za-z0-9_ &/-]{2,60}?)\s+(?:track|stem|lane)\b/i,
  ];
  for (const pattern of patterns) {
    const target = cleanString(pattern.exec(message)?.[1]);
    if (target) return target;
  }
  return null;
}

function replacementTrackName(message: string): string | null {
  const quoted = /\bnew\s+(?:track|lane)\s+(?:called|named)\s+["'“”]([^"'“”]{2,80})/i.exec(message)?.[1];
  if (quoted) return cleanString(quoted);
  const unquoted = /\bnew\s+(?:track|lane)\s+(?:called|named)\s+([A-Za-z0-9][A-Za-z0-9 _&/-]{1,60})(?:[.!?,;]|$)/i.exec(message)?.[1];
  return cleanString(unquoted);
}

function wantsTrackReplacement(message: string): boolean {
  return /\breplace\b/i.test(message) &&
    /\bnew\s+(?:track|lane)\b/i.test(message) &&
    /\b(existing|same|source|original)\b/i.test(message);
}

function barBeats(tree: ApcAgentTree): number {
  const timeline = readJson<TimelineFile>(tree, 'timeline.json');
  const numerator = typeof timeline?.timeSignature?.numerator === 'number' ? timeline.timeSignature.numerator : 4;
  return numerator > 0 ? numerator : 4;
}

function explicitKeepSections(message: string, tree: ApcAgentTree): SectionSpec[] {
  const specs: SectionSpec[] = [];
  const regex = /(?:^|[,.:\n;]|\band\b|\bin\b)\s*([A-Za-z][A-Za-z0-9 /&_-]{0,32}?)\s+(bars?|measures?|beats?)\s+(\d+(?:\.\d+)?)\s*(?:-|to|through|until|–|—)\s*(?:(?:bars?|measures?|beats?)\s*)?(\d+(?:\.\d+)?)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(message)) !== null) {
    const name = match[1]
      .replace(/^(?:keep\s+(?:it\s+)?(?:only\s+)?in|only\s+in|in|and|or)\s+/i, '')
      .trim()
      .replace(/\s+/g, ' ');
    const unit = match[2].toLowerCase();
    const start = Number(match[3]);
    const end = Number(match[4]);
    const range = /bar|measure/.test(unit)
      ? barDisplayRangeToBeats(start, end, barBeats(tree))
      : Number.isFinite(start) && Number.isFinite(end) && end > start ? {startBeat: start, endBeat: end} : null;
    if (name && range) {
      specs.push({key: slug(name), name, startBeat: range.startBeat, endBeat: range.endBeat});
    }
  }
  return specs.sort((a, b) => a.startBeat - b.startBeat);
}

function validSections(value: unknown): Section[] {
  return Array.isArray(value)
    ? value.filter((item): item is Section => {
      const section = item as Section;
      return cleanString(section.id) !== null && cleanString(section.name) !== null &&
        typeof section.startBeat === 'number' && typeof section.lengthBeats === 'number' && section.lengthBeats > 0;
    })
    : [];
}

function sectionFallback(message: string, tree: ApcAgentTree): SectionSpec[] {
  const wanted = ['chorus', 'hook', 'verse', 'bridge', 'intro', 'outro']
    .filter(word => new RegExp(`\\b${word}e?s?\\b`, 'i').test(message));
  if (wanted.length === 0) return [];
  const timeline = readJson<TimelineFile>(tree, 'timeline.json');
  return validSections(timeline?.sections)
    .filter(section => wanted.some(word => section.name.toLowerCase().includes(word)))
    .map(section => ({
      key: slug(section.name),
      name: section.name,
      startBeat: section.startBeat,
      endBeat: roundBeat(section.startBeat + section.lengthBeats),
    }));
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base.slice(0, 78);
  let suffix = 2;
  while (used.has(id)) {
    id = `${base.slice(0, 72)}-${suffix}`;
    suffix += 1;
  }
  used.add(id);
  return id;
}

function trackPath(trackId: string): string {
  return `tracks/${encodeURIComponent(trackId)}.json`;
}

function usedIds(tree: ApcAgentTree, dir: 'clips' | 'tracks'): Set<string> {
  return new Set(Object.keys(tree.files)
    .filter(path => path.startsWith(`${dir}/`) && path.endsWith('.json'))
    .map(path => cleanString(readJson<Record<string, unknown>>(tree, path)?.id))
    .filter((id): id is string => id !== null));
}

function replacementTrack(tree: ApcAgentTree, source: SourceClip, name: string, usedTrackIds: Set<string>) {
  const id = uniqueId(`ai-replace-${slug(name)}`, usedTrackIds);
  const sourceTrack = readJson<TrackFile>(tree, trackPath(source.trackId)) ?? {};
  return {
    id,
    path: trackPath(id),
    content: JSON.stringify({
      ...sourceTrack,
      id,
      name,
      isFrozen: false,
      isLocked: false,
      isMuted: false,
      isRecordArmed: false,
      isSolo: false,
    }),
  };
}

export function buildTrackReplaceShortcut(
  message: string,
  tree: ApcAgentTree,
): CopilotBuildShortcutResult | null {
  if (!wantsTrackReplacement(message)) return null;
  const target = replaceTarget(message);
  const newName = replacementTrackName(message);
  if (!target || !newName) return null;
  const sources = sourceClips(tree).filter(source => sourceLabels(source).some(label => labelContains(label, target)));
  const sections = explicitKeepSections(message, tree);
  const keepSections = sections.length > 0 ? sections : sectionFallback(message, tree);
  if (sources.length === 0 || keepSections.length === 0) return null;

  const track = replacementTrack(tree, sources[0], newName, usedIds(tree, 'tracks'));
  const usedClipIds = usedIds(tree, 'clips');
  const changes: ApcPatchTransaction['changes'] = [{op: 'createFile', path: track.path, content: track.content}];
  sources.forEach(source => {
    clipsForSections(source, keepSections, usedClipIds, track.id, null, false).forEach(clip => {
      changes.push({op: 'createFile', path: `clips/${clip.id}.json`, content: clip.content});
    });
  });

  const deletedTrackIds = new Set<string>();
  sources.forEach(source => changes.push({op: 'deleteFile', path: source.path, beforeHash: source.hash}));
  sources.forEach(source => {
    if (deletedTrackIds.has(source.trackId)) return;
    const hash = treeHash(tree, trackPath(source.trackId));
    if (hash) {
      deletedTrackIds.add(source.trackId);
      changes.push({op: 'deleteFile', path: trackPath(source.trackId), beforeHash: hash});
    }
  });
  if (changes.length <= 2 || changes.length > AGENT_PATCH_MAX_CHANGES) return null;

  return {
    text: `Prepared replacement track "${newName}" from ${sources.length} existing source clip${sources.length === 1 ? '' : 's'}, then marked the original "${target}" track for removal.`,
    patch: {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: `Replace ${target} with ${newName}`,
      changes,
    },
  };
}
