import {AGENT_PATCH_MAX_CHANGES, type ApcPatchTransaction} from './copilotAgentContract';
import type {ApcAgentTree} from './copilotAgentTools';
import {cleanString, readJson, treeHash} from './copilotBuildAudioArrangementSource';
import type {CopilotBuildShortcutResult} from './copilotBuildShortcuts';

type ChatMessage = {role?: unknown; content?: unknown};
type ClipFile = {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  trackId?: unknown;
  audioFilePath?: unknown;
  absoluteAudioFilePath?: unknown;
};
type TrackFile = {id?: unknown; name?: unknown};
type ClipEntry = {
  path: string;
  hash: string;
  id: string;
  trackId: string;
  name: string;
  audioFilePath?: string;
  absoluteAudioFilePath?: string;
};
type DeleteIntent = {
  deleteTerms: Set<string>;
  keepTerms: Set<string>;
  targetLabels: string[];
};

const DELETE_TERMS = [
  {key: 'vocal', patterns: ['vocal', 'vocals', 'vox']},
  {key: 'piano', patterns: ['piano', 'keys']},
  {key: 'bass', patterns: ['bass', '808', 'sub']},
  {key: 'drum', patterns: ['drum', 'drums', 'kick', 'snare', 'hat', 'hats']},
  {key: 'guitar', patterns: ['guitar']},
  {key: 'other', patterns: ['other']},
] as const;

function normalizeLabel(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9#]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function termInText(text: string, patterns: readonly string[]): boolean {
  const normalized = normalizeLabel(text);
  return patterns.some(pattern => {
    const token = normalizeLabel(pattern);
    return token.length > 0 && new RegExp(`\\b${token}\\b`, 'i').test(normalized);
  });
}

function termsInText(text: string): Set<string> {
  const terms = new Set<string>();
  DELETE_TERMS.forEach(term => {
    if (termInText(text, term.patterns)) {
      terms.add(term.key);
    }
  });
  return terms;
}

function keepTermsInText(text: string): Set<string> {
  const keepTerms = new Set<string>();
  DELETE_TERMS.forEach(term => {
    const keepPattern = term.patterns.some(pattern =>
      new RegExp(`\\b(?:keep|not|except|without deleting|don't delete|do not delete)\\b[^.\\n,;]*\\b${pattern}\\b`, 'i').test(text),
    );
    if (keepPattern) {
      keepTerms.add(term.key);
    }
  });
  return keepTerms;
}

function quotedTargets(text: string): string[] {
  const targets: string[] = [];
  const regex = /["'“”]([^"'“”]{2,100})["'“”]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const target = cleanString(match[1]);
    if (target) {
      targets.push(target);
    }
  }
  return targets;
}

function namedTargets(text: string): string[] {
  const match = /\b(?:track|stem|clip)\s+(?:named|called|with|for)\s+([A-Za-z0-9_ .-]{3,80})/i.exec(text);
  const target = cleanString(match?.[1]?.replace(/\b(?:and|but|please|only)\b.*$/i, ''));
  return target ? [target] : [];
}

function userHistory(history: unknown): string[] {
  return Array.isArray(history)
    ? (history as ChatMessage[])
      .filter(message => message.role === 'user' && typeof message.content === 'string')
      .map(message => message.content as string)
    : [];
}

function isDeleteRequest(text: string): boolean {
  return /\b(delete|remove|get rid of|drop)\b/i.test(text);
}

function isContextualDelete(text: string): boolean {
  return /\b(that track|the track|that stem|the stem|that clip|those clips|all clips on that track|it|them)\b/i.test(text);
}

function deleteIntent(message: string, history?: unknown): DeleteIntent | null {
  if (!isDeleteRequest(message)) {
    return null;
  }

  const keepTerms = keepTermsInText(message);
  const deleteTerms = termsInText(message);
  keepTerms.forEach(term => deleteTerms.delete(term));
  const targetLabels = [...quotedTargets(message), ...namedTargets(message)];

  if (deleteTerms.size === 0 && targetLabels.length === 0 && isContextualDelete(message)) {
    for (const previous of userHistory(history).slice(-6).reverse()) {
      const previousTargets = [...quotedTargets(previous), ...namedTargets(previous)];
      const previousTerms = termsInText(previous);
      keepTermsInText(previous).forEach(term => previousTerms.delete(term));
      if (previousTargets.length > 0 || previousTerms.size > 0) {
        return {deleteTerms: previousTerms, keepTerms, targetLabels: previousTargets};
      }
    }
  }

  return deleteTerms.size > 0 || targetLabels.length > 0
    ? {deleteTerms, keepTerms, targetLabels}
    : null;
}

function trackPath(trackId: string): string {
  return `tracks/${encodeURIComponent(trackId)}.json`;
}

function baseName(path: string | undefined): string | null {
  if (!path) {
    return null;
  }
  const name = path.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '');
  return cleanString(name);
}

function sourceClipName(name: string): string {
  const parts = name.split(/\s+-\s+/);
  return parts[parts.length - 1] ?? name;
}

function sourceLabels(clip: ClipEntry): string[] {
  return [
    sourceClipName(clip.name),
    baseName(clip.audioFilePath),
    baseName(clip.absoluteAudioFilePath),
  ].filter((label): label is string => Boolean(label));
}

function labelContains(label: string, target: string): boolean {
  const haystack = normalizeLabel(label);
  const needle = normalizeLabel(target);
  return needle.length > 0 && (haystack.includes(needle) || needle.includes(haystack));
}

function labelMatchesTerm(label: string, termKey: string): boolean {
  const term = DELETE_TERMS.find(item => item.key === termKey);
  return Boolean(term && termInText(label, term.patterns));
}

function clipEntries(tree: ApcAgentTree): ClipEntry[] {
  return Object.keys(tree.files)
    .filter(path => path.startsWith('clips/') && path.endsWith('.json'))
    .map(path => ({path, hash: treeHash(tree, path), clip: readJson<ClipFile>(tree, path)}))
    .map(({path, hash, clip}) => {
      const id = cleanString(clip?.id);
      const trackId = cleanString(clip?.trackId);
      const name = cleanString(clip?.name) ?? id;
      const audioFilePath = cleanString(clip?.audioFilePath) ?? undefined;
      const absoluteAudioFilePath = cleanString(clip?.absoluteAudioFilePath) ?? undefined;
      if (!id || !trackId || !name || !hash) {
        return null;
      }
      const entry: ClipEntry = {path, hash, id, trackId, name};
      if (audioFilePath) {
        entry.audioFilePath = audioFilePath;
      }
      if (absoluteAudioFilePath) {
        entry.absoluteAudioFilePath = absoluteAudioFilePath;
      }
      return entry;
    })
    .filter((clip): clip is ClipEntry => clip !== null);
}

function trackIds(tree: ApcAgentTree): string[] {
  return Object.keys(tree.files)
    .filter(path => path.startsWith('tracks/') && path.endsWith('.json'))
    .map(path => cleanString(readJson<TrackFile>(tree, path)?.id))
    .filter((id): id is string => id !== null);
}

function trackName(tree: ApcAgentTree, trackId: string): string {
  const track = readJson<TrackFile>(tree, trackPath(trackId));
  return cleanString(track?.name) ?? trackId;
}

function trackMatches(
  tree: ApcAgentTree,
  trackId: string,
  clips: ClipEntry[],
  intent: DeleteIntent,
): boolean {
  const labels = [
    trackName(tree, trackId),
    trackId,
    ...clips.filter(clip => clip.trackId === trackId).flatMap(sourceLabels),
  ];
  const deleteByTarget = intent.targetLabels.some(target =>
    labels.some(label => labelContains(label, target)),
  );
  const deleteByTerm = [...intent.deleteTerms].some(term =>
    labels.some(label => labelMatchesTerm(label, term)),
  );
  const kept = [...intent.keepTerms].some(term =>
    labels.some(label => labelMatchesTerm(label, term)),
  );
  return (deleteByTarget || deleteByTerm) && !kept;
}

export function buildDeleteTracksShortcut(
  message: string,
  tree: ApcAgentTree,
  history?: unknown,
): CopilotBuildShortcutResult | null {
  const intent = deleteIntent(message, history);
  if (!intent) {
    return null;
  }
  const clips = clipEntries(tree);
  const matches = trackIds(tree).filter(trackId => trackMatches(tree, trackId, clips, intent));
  if (matches.length === 0) {
    return null;
  }

  const changes: ApcPatchTransaction['changes'] = [];
  const matched = new Set(matches);
  clips
    .filter(clip => matched.has(clip.trackId))
    .forEach(clip => changes.push({op: 'deleteFile', path: clip.path, beforeHash: clip.hash}));
  matches.forEach(trackId => {
    const path = trackPath(trackId);
    const beforeHash = treeHash(tree, path);
    if (beforeHash) {
      changes.push({op: 'deleteFile', path, beforeHash});
    }
  });
  if (changes.length === 0 || changes.length > AGENT_PATCH_MAX_CHANGES) {
    return null;
  }

  const labels = matches.map(trackId => trackName(tree, trackId)).join(', ');
  const clipCount = changes.length - matches.length;
  return {
    text: `Prepared deletion of ${labels} and ${clipCount} associated clip${clipCount === 1 ? '' : 's'}.`,
    patch: {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: `Delete ${labels}`,
      changes,
    },
  };
}
