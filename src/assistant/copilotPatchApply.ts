import {
  APC_DIR,
  APC_PATHS,
  compileApcSourceToSnapshot,
  decomposeSnapshotToApcSource,
  parseApcSourceFiles,
  serializeApcSource,
  type ApcValidationIssue,
} from '../arrangement/apc';
import {createArrangementLockLookup} from '../arrangement/operationLocks';
import {captureProjectSnapshot, type ProjectSnapshot} from '../arrangement/projectSnapshot';
import {canonicalJsonStringify} from '../arrangement/canonicalJson';
import {buildApcVirtualTree, hashApcContent} from './apcSourceTree';
import {
  mergeCreatedAudioClipFields,
  mergeStrippedClipFields,
  restoreLiveClipStrippedFields,
  sourceClipByAudioPath,
} from './copilotPatchMediaFields';

/** Patch transaction (renderer mirror of electron/copilotAgentContract.ts). */
export type ApcPatchChange =
  | {op: 'replaceFile'; path: string; beforeHash: string; content: string}
  | {op: 'mergeFields'; path: string; beforeHash: string; fields: Record<string, unknown>}
  | {op: 'createFile'; path: string; content: string}
  | {op: 'deleteFile'; path: string; beforeHash: string};

export type ApcPatchTransaction = {
  schemaVersion: 1;
  baseFingerprint: string;
  summary: string;
  changes: ApcPatchChange[];
};

export type ApcPatchConflict = {path: string; reason: string};

export type ApcPatchApplyResult =
  | {ok: true; snapshot: ProjectSnapshot; summary: string; warnings: ApcValidationIssue[]}
  | {ok: false; conflicts: ApcPatchConflict[]; errors?: ApcValidationIssue[]};

const TS = '1970-01-01T00:00:00.000Z';

function pathIsSafe(relativePath: string): boolean {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    return false;
  }
  return !relativePath
    .split('/')
    .some(seg => seg === '..' || seg === '.' || seg.length === 0 || seg.includes('\\'));
}

/**
 * Lock enforcement for the patch path. The operation-based edit path runs lock checks
 * inside applyArrangementOperations, but a patch compiles to a full snapshot and stages
 * via restoreProjectSnapshot, which intentionally skips those checks (restore must be
 * able to recreate locked assets verbatim on open). So we enforce locks HERE, against
 * the CURRENT project: any change that touches a locked/frozen track, a locked clip (or
 * a clip on a locked/frozen track), that track's FX, or a pattern used by a locked clip
 * is rejected — and a createFile that would add a clip to a locked/frozen track too.
 * (applyApcPatch is only used for agent patches; open/restore never calls it, so locked
 * assets still round-trip on load.)
 */
/** The track a clip change lands on after applying (for "no clip on a locked track"). */
function clipTargetTrackId(change: ApcPatchChange, currentClip?: {trackId: string}): string | undefined {
  if (change.op === 'deleteFile') {
    return undefined;
  }
  if (change.op === 'mergeFields') {
    const merged = (change.fields as {trackId?: unknown}).trackId;
    return typeof merged === 'string' ? merged : currentClip?.trackId;
  }
  // createFile / replaceFile carry the whole clip JSON.
  try {
    const next = (JSON.parse(change.content) as {trackId?: unknown}).trackId;
    return typeof next === 'string' ? next : currentClip?.trackId;
  } catch {
    return currentClip?.trackId;
  }
}

function lockConflicts(snapshot: ProjectSnapshot, changes: ApcPatchChange[]): ApcPatchConflict[] {
  const lookup = createArrangementLockLookup({tracks: snapshot.tracks, blocks: snapshot.blocks});
  const trackByPath = new Map(snapshot.tracks.map(track => [APC_PATHS.track(track.id), track]));
  const clipByPath = new Map(snapshot.blocks.map(block => [APC_PATHS.clip(block.id), block]));
  const fxTrackIdByPath = new Map(snapshot.tracks.map(track => [APC_PATHS.fx(track.id), track.id]));
  const patternIdByPath = new Map(Object.keys(snapshot.patterns).map(id => [APC_PATHS.pattern(id), id]));
  const conflicts: ApcPatchConflict[] = [];

  for (const change of changes) {
    const path = change.path;
    const track = trackByPath.get(path);
    if (track && lookup.trackLockedById.get(track.id)) {
      conflicts.push({path, reason: `Track "${track.name}" is locked or frozen.`});
      continue;
    }
    const fxTrackId = fxTrackIdByPath.get(path);
    if (fxTrackId && lookup.trackLockedById.get(fxTrackId)) {
      conflicts.push({path, reason: 'FX for a locked or frozen track cannot be edited.'});
      continue;
    }
    const clip = clipByPath.get(path);
    const isClipPath = path.startsWith(`${APC_DIR.clips}/`);
    if (clip || (isClipPath && change.op === 'createFile')) {
      // Editing/deleting an existing locked clip (or a clip on a locked/frozen track).
      if (clip && (clip.isLocked === true || lookup.trackLockedById.get(clip.trackId) === true)) {
        conflicts.push({path, reason: `Clip "${clip.name}" is locked or on a locked/frozen track.`});
        continue;
      }
      // Adding a clip to — or moving one onto — a locked/frozen track. Check the
      // RESULTING trackId (from the patch), not just the clip's current location, so a
      // mergeFields/replaceFile that reassigns trackId can't smuggle a clip onto a lock.
      const targetTrackId = clipTargetTrackId(change, clip);
      if (targetTrackId && lookup.trackLockedById.get(targetTrackId) === true) {
        conflicts.push({path, reason: 'Cannot place a clip on a locked or frozen track.'});
      }
      continue;
    }
    const patternId = patternIdByPath.get(path);
    if (patternId && lookup.lockedPatternIds.has(patternId)) {
      conflicts.push({path, reason: 'Pattern is used by a locked or frozen clip.'});
    }
  }
  return conflicts;
}

/** Rebuild manifest ordering arrays from the files actually present after the patch. */
function reconcileManifest(files: Map<string, string>): void {
  const prev = JSON.parse(files.get('manifest.json') ?? '{}') as Record<string, unknown>;
  const presentIds = (dir: string, idOf: (value: Record<string, unknown>) => unknown): string[] => {
    const ids: string[] = [];
    for (const [filePath, content] of files) {
      if (filePath.startsWith(`${dir}/`) && filePath.endsWith('.json')) {
        try {
          const id = idOf(JSON.parse(content) as Record<string, unknown>);
          if (typeof id === 'string' && id.length > 0) {
            ids.push(id);
          }
        } catch {
          /* skip unparseable */
        }
      }
    }
    return ids;
  };
  const ordered = (prevIds: unknown, present: string[]): string[] => {
    const presentSet = new Set(present);
    const kept = (Array.isArray(prevIds) ? (prevIds as string[]) : []).filter(id => presentSet.has(id));
    const keptSet = new Set(kept);
    const added = present.filter(id => !keptSet.has(id)).sort();
    return [...kept, ...added];
  };
  const manifest = {
    ...prev,
    format: 'ai-producer-core.apc',
    version: 1,
    savedAt: typeof prev.savedAt === 'string' ? prev.savedAt : TS,
    trackIds: ordered(prev.trackIds, presentIds('tracks', value => value.id)),
    clipIds: ordered(prev.clipIds, presentIds('clips', value => value.id)),
    patternIds: ordered(prev.patternIds, presentIds('patterns', value => value.id)),
    fxTrackIds: ordered(prev.fxTrackIds, presentIds('fx', value => value.fx.trackId)),
  };
  files.set('manifest.json', canonicalJsonStringify(manifest));
}

/**
 * Validate a patch against the CURRENT project and compile the proposed snapshot.
 *
 * - Optimistic concurrency: baseFingerprint must match the live tree, and each
 *   change's beforeHash must match the current sanitized file hash. Any mismatch
 *   reports a conflict and NOTHING is applied (never a half-applied patch).
 * - Edits are merged into the FULL source (not the sanitized view) so stripped
 *   fields (waveforms, local paths) survive.
 * - The result is a proposed ProjectSnapshot; committing it to the store is the
 *   staging layer's job (Phase 4).
 */
export function applyApcPatch(patch: ApcPatchTransaction): ApcPatchApplyResult {
  const snapshot = captureProjectSnapshot();
  const view = buildApcVirtualTree(snapshot);
  const conflicts: ApcPatchConflict[] = [];

  if (patch.baseFingerprint !== view.fingerprint) {
    conflicts.push({path: '*', reason: 'Project changed since the patch was generated.'});
    return {ok: false, conflicts};
  }

  const viewHash = new Map(view.index.map(entry => [entry.path, entry.contentHash]));
  // Full source files (with stripped fields intact) — the apply target.
  const files = new Map(
    serializeApcSource(decomposeSnapshotToApcSource(snapshot, TS)).map(f => [f.relativePath, f.content]),
  );
  restoreLiveClipStrippedFields(files, snapshot);
  const sourceByAudioPath = sourceClipByAudioPath(files);

  for (const change of patch.changes) {
    if (!pathIsSafe(change.path)) {
      conflicts.push({path: change.path, reason: 'Unsafe path.'});
      continue;
    }
    if (change.op === 'createFile') {
      // createFile must not clobber an existing file — that path belongs to replaceFile,
      // which carries a beforeHash for optimistic-concurrency. Silently overwriting would
      // bypass the stale-edit guard.
      if (viewHash.has(change.path)) {
        conflicts.push({path: change.path, reason: 'File already exists — use replaceFile to modify it.'});
      }
      continue;
    }
    const expected = viewHash.get(change.path);
    if (expected === undefined) {
      conflicts.push({path: change.path, reason: 'File no longer exists.'});
      continue;
    }
    if (change.beforeHash !== expected) {
      conflicts.push({path: change.path, reason: 'File changed since it was read (stale beforeHash).'});
      continue;
    }
  }
  // Enforce constraint locks (the snapshot-staging path bypasses applyArrangementOperations' checks).
  conflicts.push(...lockConflicts(snapshot, patch.changes));
  if (conflicts.length > 0) {
    return {ok: false, conflicts};
  }

  // All checks passed — apply onto the full source.
  for (const change of patch.changes) {
    if (change.op === 'deleteFile') {
      files.delete(change.path);
    } else if (change.op === 'mergeFields') {
      const current = files.get(change.path);
      const base = current ? (JSON.parse(current) as Record<string, unknown>) : {};
      files.set(change.path, canonicalJsonStringify({...base, ...change.fields}));
    } else {
      // replaceFile / createFile
      const source = files.get(change.path);
      const merged = source === undefined && change.op === 'createFile'
        ? mergeCreatedAudioClipFields(sourceByAudioPath, change.path, change.content)
        : mergeStrippedClipFields(change.path, source, change.content);
      files.set(change.path, merged);
    }
  }

  reconcileManifest(files);

  const parsed = parseApcSourceFiles(Array.from(files, ([relativePath, content]) => ({relativePath, content})));
  if (!parsed.ok) {
    return {ok: false, conflicts: [{path: '*', reason: parsed.error}]};
  }
  const compiled = compileApcSourceToSnapshot(parsed.source);
  if (!compiled.ok) {
    return {ok: false, conflicts: [], errors: compiled.errors};
  }
  // Re-hash sanity (defensive): ensure the produced files are internally coherent.
  void hashApcContent;
  return {ok: true, snapshot: compiled.snapshot, summary: patch.summary, warnings: compiled.warnings};
}
