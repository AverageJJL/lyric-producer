import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import type {DrumPattern} from '../../music/drumPatterns';
import {
  emptyCopilotChatProjectState,
  normalizeCopilotChatProjectState,
} from '../../assistant/copilotChatHistory';
import {
  APC_DIR,
  APC_FILE,
  APC_PATHS,
  APC_SOURCE_FORMAT,
  APC_SOURCE_VERSION,
  type ApcProjectFile,
  type ApcProjectManifest,
  type ApcSourceFile,
  type ApcSourceProject,
  type ApcTimelineFile,
  type ApcTrackFxFile,
} from './apcSourceTypes';

export type ApcParseResult =
  | {ok: true; source: ApcSourceProject}
  | {ok: false; error: string};

function parseSingleton<T>(
  byPath: Map<string, string>,
  relativePath: string,
): {ok: true; value: T} | {ok: false; error: string} {
  const raw = byPath.get(relativePath);
  if (raw === undefined) {
    return {ok: false, error: `Missing ${relativePath}`};
  }
  try {
    return {ok: true, value: JSON.parse(raw) as T};
  } catch {
    return {ok: false, error: `Invalid JSON in ${relativePath}`};
  }
}

function parseOptionalSingleton<T>(
  byPath: Map<string, string>,
  relativePath: string,
  fallback: T,
): {ok: true; value: T} | {ok: false; error: string} {
  return byPath.has(relativePath) ? parseSingleton<T>(byPath, relativePath) : {ok: true, value: fallback};
}

/**
 * Rebuild the in-memory `.apc` tree from a flat list of files (the inverse of
 * `serializeApcSource`). Entity ids are read from each file's JSON `id` field —
 * the authoritative source — rather than decoded from the filename, so the format
 * is robust to however ids were encoded into path segments.
 */
export function parseApcSourceFiles(files: ApcSourceFile[]): ApcParseResult {
  const byPath = new Map(files.map(file => [file.relativePath, file.content]));

  const manifest = parseSingleton<ApcProjectManifest>(byPath, APC_FILE.manifest);
  if (!manifest.ok) {
    return {ok: false, error: manifest.error};
  }
  // Explicit format/version gate: refuse to interpret a file that is not an `.apc`
  // tree this build understands, rather than casting a foreign/future manifest and
  // compiling garbage. (Migration of older formats is intentionally unsupported.)
  const {format, version} = manifest.value as {format?: unknown; version?: unknown};
  if (format !== APC_SOURCE_FORMAT) {
    return {ok: false, error: `Unrecognized project format ${JSON.stringify(format)} (expected "${APC_SOURCE_FORMAT}").`};
  }
  if (version !== APC_SOURCE_VERSION) {
    return {ok: false, error: `Unsupported .apc version ${JSON.stringify(version)} (this build supports version ${APC_SOURCE_VERSION}).`};
  }
  const project = parseSingleton<ApcProjectFile>(byPath, APC_FILE.project);
  if (!project.ok) {
    return {ok: false, error: project.error};
  }
  const timeline = parseSingleton<ApcTimelineFile>(byPath, APC_FILE.timeline);
  if (!timeline.ok) {
    return {ok: false, error: timeline.error};
  }
  const copilot = parseOptionalSingleton(
    byPath,
    APC_FILE.copilot,
    emptyCopilotChatProjectState(),
  );
  if (!copilot.ok) {
    return {ok: false, error: copilot.error};
  }

  // Object.create(null): these maps are keyed by externally-authored ids. Using a
  // null-prototype object means a malicious/odd id such as "__proto__" or "toString"
  // is a plain data key, never a prototype-chain hit — so downstream `in`/lookup and
  // validation cannot be fooled into treating a phantom id as a real entity.
  const tracks: Record<string, DAWTrack> = Object.create(null);
  const clips: Record<string, DAWBlock> = Object.create(null);
  const patterns: Record<string, DrumPattern> = Object.create(null);
  const fx: Record<string, ApcTrackFxFile> = Object.create(null);

  for (const file of files) {
    const parts = file.relativePath.split('/');
    if (parts.length !== 2) {
      continue; // singletons handled above; ignore anything unexpected.
    }
    const [dir] = parts;
    let value: unknown;
    try {
      value = JSON.parse(file.content);
    } catch {
      return {ok: false, error: `Invalid JSON in ${file.relativePath}`};
    }
    // A per-entity file MUST live at the path its content id encodes. Lock enforcement
    // and the manifest key off the file PATH, but the parser/compiler key off the
    // content `id`; if they could disagree, a write to an unlocked entity's path could
    // carry a locked entity's id and be redirected onto it (lock bypass), and an
    // id-collision would silently drop a sibling entity. Requiring path === expected
    // path closes both holes for every caller (open / recover / agent patch).
    if (dir === APC_DIR.tracks) {
      const track = value as DAWTrack;
      if (file.relativePath !== APC_PATHS.track(track.id)) {
        return {ok: false, error: `Track file "${file.relativePath}" does not match its id "${track.id}".`};
      }
      tracks[track.id] = track;
    } else if (dir === APC_DIR.clips) {
      const clip = value as DAWBlock;
      if (file.relativePath !== APC_PATHS.clip(clip.id)) {
        return {ok: false, error: `Clip file "${file.relativePath}" does not match its id "${clip.id}".`};
      }
      clips[clip.id] = clip;
    } else if (dir === APC_DIR.patterns) {
      const pattern = value as DrumPattern;
      if (file.relativePath !== APC_PATHS.pattern(pattern.id)) {
        return {ok: false, error: `Pattern file "${file.relativePath}" does not match its id "${pattern.id}".`};
      }
      patterns[pattern.id] = pattern;
    } else if (dir === APC_DIR.fx) {
      const fxFile = value as ApcTrackFxFile;
      if (fxFile?.fx?.trackId) {
        if (file.relativePath !== APC_PATHS.fx(fxFile.fx.trackId)) {
          return {ok: false, error: `FX file "${file.relativePath}" does not match track id "${fxFile.fx.trackId}".`};
        }
        fx[fxFile.fx.trackId] = fxFile;
      }
    }
  }

  return {
    ok: true,
    source: {
      manifest: manifest.value,
      project: project.value,
      timeline: timeline.value,
      copilot: normalizeCopilotChatProjectState(copilot.value),
      tracks,
      clips,
      patterns,
      fx,
    },
  };
}
