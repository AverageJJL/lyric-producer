import type {DAWTrack} from '../../store/useDAWStore';
import {validateTrackRouting} from '../../music/trackRouting';
import type {
  ApcSourceProject,
  ApcValidationCode,
  ApcValidationIssue,
} from './apcSourceTypes';

/**
 * Own-property membership test. The entity maps may be JSON-parsed plain objects
 * (with Object.prototype), so a bare `id in map` would report ids like "toString"
 * or "__proto__" as present even with no backing file — letting phantom entities
 * slip past manifest/dangling checks. hasOwn closes that hole.
 */
function hasOwn(map: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

const MIDI_MIN = 0;
const MIDI_MAX = 127;
// Notes are normalized to clip length elsewhere; allow a tiny float tolerance so a
// note that ends exactly at the clip boundary is not falsely flagged.
const CLIP_LENGTH_EPSILON = 1e-6;

/**
 * Issues that make the tree structurally un-compilable. Everything else
 * (routing problems, out-of-range notes, suspicious asset paths) is surfaced as a
 * non-fatal warning so a slightly-corrupt project can still open while the user is
 * told what is wrong.
 */
const FATAL_CODES: ReadonlySet<ApcValidationCode> = new Set([
  'duplicate-id',
  'manifest-mismatch',
  'dangling-clip-track',
  'unsafe-path',
]);

export function isFatalApcIssue(issue: ApcValidationIssue): boolean {
  return FATAL_CODES.has(issue.code);
}

/** Reject absolute paths and parent-directory traversal in stored media references. */
export function apcRelativePathIsSafe(path: string): boolean {
  if (typeof path !== 'string' || path.length === 0) {
    return false;
  }
  // Absolute POSIX, Windows drive, or UNC-style paths must never appear in source.
  if (path.startsWith('/') || path.startsWith('\\') || /^[A-Za-z]:[\\/]/.test(path)) {
    return false;
  }
  const segments = path.split(/[\\/]/);
  return !segments.some(seg => seg === '..' || seg === '.' || seg.length === 0);
}

function idIsFileSafe(id: string): boolean {
  if (typeof id !== 'string' || id.length === 0) {
    return false;
  }
  // Reject the reserved relative-path tokens for consistency with
  // apcRelativePathIsSafe (even though encodeURIComponent keeps them benign).
  if (id === '.' || id === '..') {
    return false;
  }
  if (id.includes('/') || id.includes('\\')) {
    return false;
  }
  // Reject control characters without a control-char regex (keeps eslint happy).
  for (let index = 0; index < id.length; index += 1) {
    if (id.charCodeAt(index) < 0x20) {
      return false;
    }
  }
  return true;
}

function checkDuplicates(ids: string[], label: string, issues: ApcValidationIssue[]): void {
  const seen = new Set<string>();
  ids.forEach(id => {
    if (seen.has(id)) {
      issues.push({code: 'duplicate-id', message: `Duplicate ${label} id "${id}".`, entityId: id});
    }
    seen.add(id);
  });
}

function checkManifestMatch(
  ids: string[],
  map: Record<string, unknown>,
  label: string,
  issues: ApcValidationIssue[],
): void {
  const idSet = new Set(ids);
  ids.forEach(id => {
    if (!hasOwn(map, id)) {
      issues.push({
        code: 'manifest-mismatch',
        message: `Manifest lists ${label} "${id}" but its file is missing.`,
        entityId: id,
      });
    }
    if (!idIsFileSafe(id)) {
      issues.push({code: 'unsafe-path', message: `Unsafe ${label} id "${id}".`, entityId: id});
    }
  });
  Object.keys(map).forEach(id => {
    if (!idSet.has(id)) {
      issues.push({
        code: 'manifest-mismatch',
        message: `${label} file "${id}" is not listed in the manifest.`,
        entityId: id,
      });
    }
  });
}

function checkClips(source: ApcSourceProject, issues: ApcValidationIssue[]): void {
  const {tracks, clips, patterns} = source;
  Object.values(clips).forEach(clip => {
    if (!hasOwn(tracks, clip.trackId)) {
      issues.push({
        code: 'dangling-clip-track',
        message: `Clip "${clip.id}" references missing track "${clip.trackId}".`,
        entityId: clip.id,
      });
    }
    if (clip.patternId && !hasOwn(patterns, clip.patternId)) {
      issues.push({
        code: 'dangling-pattern',
        message: `Clip "${clip.id}" references missing pattern "${clip.patternId}".`,
        entityId: clip.id,
      });
    }
    [clip.audioFilePath, clip.spectrogramPngPath].forEach(candidate => {
      if (candidate && !apcRelativePathIsSafe(candidate)) {
        issues.push({
          code: 'unsafe-asset-path',
          message: `Clip "${clip.id}" has an unsafe asset path "${candidate}".`,
          entityId: clip.id,
        });
      }
    });
    if (clip.type === 'midi' && Array.isArray(clip.notes)) {
      // A note may legitimately EXTEND past the clip edge: non-destructive resize
      // (useDAWStore.resizeBlock) shrinks lengthBeats without trimming notes so the
      // user can resize back out. Only a note that BEGINS at/after the clip end is
      // truly orphaned — matching trimNotesToClipLength's own `startBeat >= length`
      // drop rule. So we check the note start, not the note end.
      const startLimit = clip.lengthBeats - CLIP_LENGTH_EPSILON;
      clip.notes.forEach((note, index) => {
        const inRange =
          Number.isInteger(note.note) &&
          note.note >= MIDI_MIN &&
          note.note <= MIDI_MAX &&
          Number.isFinite(note.velocity) &&
          note.velocity >= MIDI_MIN &&
          note.velocity <= MIDI_MAX;
        if (!inRange) {
          issues.push({
            code: 'note-out-of-range',
            message: `Clip "${clip.id}" note ${index} is outside the MIDI range.`,
            entityId: clip.id,
          });
        }
        if (note.startBeat < -CLIP_LENGTH_EPSILON || note.startBeat >= startLimit) {
          issues.push({
            code: 'note-out-of-clip',
            message: `Clip "${clip.id}" note ${index} starts outside the clip length.`,
            entityId: clip.id,
          });
        }
      });
    }
  });
}

/**
 * Validate semantic invariants of an `.apc` source tree: unique ids, manifest
 * consistency, dangling references, MIDI bounds, routing integrity, and safe asset
 * paths. Returns every issue found; callers decide which are fatal via
 * {@link isFatalApcIssue}.
 */
export function validateApcSource(source: ApcSourceProject): ApcValidationIssue[] {
  const issues: ApcValidationIssue[] = [];
  const {manifest, tracks, clips, patterns, fx} = source;

  checkDuplicates(manifest.trackIds, 'track', issues);
  checkDuplicates(manifest.clipIds, 'clip', issues);
  checkDuplicates(manifest.patternIds, 'pattern', issues);
  checkDuplicates(manifest.fxTrackIds, 'fx', issues);

  checkManifestMatch(manifest.trackIds, tracks, 'track', issues);
  checkManifestMatch(manifest.clipIds, clips, 'clip', issues);
  checkManifestMatch(manifest.patternIds, patterns, 'pattern', issues);
  checkManifestMatch(manifest.fxTrackIds, fx, 'fx', issues);

  checkClips(source, issues);

  // Reuse the canonical routing validator so the source format never drifts from
  // the runtime's understanding of valid bus/aux/sidechain graphs.
  const trackList = manifest.trackIds
    .map(id => tracks[id])
    .filter((track): track is DAWTrack => Boolean(track));
  validateTrackRouting(trackList).forEach(issue => {
    issues.push({
      code: 'routing',
      message: `Routing issue (${issue.type}) on track "${issue.trackId}".`,
      entityId: issue.trackId,
      detail: issue.targetTrackId,
    });
  });

  return issues;
}
