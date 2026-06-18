import {canonicalJsonStringify} from '../arrangement/canonicalJson';
import {APC_PATHS, decomposeSnapshotToApcSource, serializeApcSource} from '../arrangement/apc';
import {snapshotFingerprint, type ProjectSnapshot} from '../arrangement/projectSnapshot';

/**
 * The sanitized, in-memory `.apc` source tree the Copilot agent navigates with
 * its list/read/grep/edit tools. It is a PROJECTION of the live snapshot, never
 * the bytes on disk: large/binary/derived fields and local-disk paths are stripped
 * so the model only ever sees small, editable JSON metadata.
 */
export type ApcFileEntry = {
  path: string;
  bytes: number;
  /** Stable hash of the (sanitized) content; the model echoes it back as `beforeHash`. */
  contentHash: string;
};

export type ApcVirtualTree = {
  schemaVersion: 1;
  /** Equals snapshotFingerprint(snapshot) — the optimistic-concurrency anchor. */
  fingerprint: string;
  files: Record<string, string>;
  index: ApcFileEntry[];
};

// Fields removed from clip files in the agent's view: huge arrays, machine-local
// absolute paths, and render byproducts the model must never author. Exported so the
// patch-applier can RE-ATTACH them when the model replaces a clip file (otherwise a
// replaceFile of the sanitized view would silently destroy the waveform/media data).
export const STRIPPED_CLIP_FIELDS = [
  'waveformPeaks',
  'absoluteAudioFilePath',
  'sourcePeakAmplitude',
  'sourceFileBytes',
  'spectrogramRequestId',
  'spectrogramPngPath',
  'spectrogramError',
] as const;

// Stable placeholder so a given snapshot always yields the same tree bytes
// (real savedAt is irrelevant to the model and would add churn to diffs/hashes).
const VIEW_SAVED_AT = '1970-01-01T00:00:00.000Z';

function isAgentVisibleFile(relativePath: string): boolean {
  // Chat transcripts are project data for save/open, but they are not editable
  // arrangement source. Keeping them out of the agent tree prevents one chat session
  // from leaking into a new session through copilot.json.
  return relativePath !== APC_PATHS.copilot;
}

/** FNV-1a 32-bit hash → 8 hex chars. Deterministic, dependency-free. */
export function hashApcContent(content: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < content.length; index += 1) {
    hash ^= content.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function sanitizeFileContent(relativePath: string, content: string): string {
  if (!relativePath.startsWith('clips/')) {
    return content;
  }
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    for (const field of STRIPPED_CLIP_FIELDS) {
      delete parsed[field];
    }
    return canonicalJsonStringify(parsed);
  } catch {
    return content;
  }
}

/** Build the sanitized virtual tree for the agent from a live snapshot. */
export function buildApcVirtualTree(snapshot: ProjectSnapshot): ApcVirtualTree {
  const source = decomposeSnapshotToApcSource(snapshot, VIEW_SAVED_AT);
  const files: Record<string, string> = {};
  const index: ApcFileEntry[] = [];
  for (const file of serializeApcSource(source)) {
    if (!isAgentVisibleFile(file.relativePath)) {
      continue;
    }
    const content = sanitizeFileContent(file.relativePath, file.content);
    files[file.relativePath] = content;
    index.push({
      path: file.relativePath,
      bytes: content.length,
      contentHash: hashApcContent(content),
    });
  }
  index.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    schemaVersion: 1,
    fingerprint: snapshotFingerprint(snapshot),
    files,
    index,
  };
}
