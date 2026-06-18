import type {ProjectSnapshot} from '../projectSnapshot';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import type {DrumPattern} from '../../music/drumPatterns';
import type {TrackFxState} from '../../native/fxContract';
import type {TrackAmpSimState} from '../../native/ampSimContract';
import type {CopilotChatProjectState} from '../../assistant/copilotChatHistory';

/**
 * Types and path conventions for the folder-based `.apc` source format.
 *
 * The `.apc` tree is a *faithful, reversible projection* of a {@link ProjectSnapshot}
 * reorganized into many small JSON files (one per track / clip / pattern), so it is
 * grep-friendly for the Copilot agent and produces small per-entity diffs. It is NOT
 * a second source of truth: it compiles back to the exact same snapshot (same
 * `snapshotFingerprint`). Runtime-only sanitization (stripping audio bytes / absolute
 * paths) happens later in the agent's *view* of this tree, not on disk.
 */

export const APC_SOURCE_FORMAT = 'ai-producer-core.apc';
export const APC_SOURCE_VERSION = 1;
export const APC_FOLDER_EXTENSION = '.apc';

/** Top-level singleton files. */
export const APC_FILE = {
  manifest: 'manifest.json',
  project: 'project.json',
  timeline: 'timeline.json',
  copilot: 'copilot.json',
} as const;

/** Per-entity sub-directories. */
export const APC_DIR = {
  tracks: 'tracks',
  clips: 'clips',
  patterns: 'patterns',
  fx: 'fx',
} as const;

/**
 * Encode an entity id into a single, path-safe filename component. Generated ids
 * (e.g. `track-1717-3`) pass through unchanged so the tree stays readable; only
 * exotic ids get percent-encoded. The authoritative id is always read back from
 * the file's JSON `id` field, never decoded from the filename.
 */
function fileSegment(id: string): string {
  return encodeURIComponent(id);
}

export const APC_PATHS = {
  manifest: APC_FILE.manifest,
  project: APC_FILE.project,
  timeline: APC_FILE.timeline,
  copilot: APC_FILE.copilot,
  track: (id: string) => `${APC_DIR.tracks}/${fileSegment(id)}.json`,
  clip: (id: string) => `${APC_DIR.clips}/${fileSegment(id)}.json`,
  pattern: (id: string) => `${APC_DIR.patterns}/${fileSegment(id)}.json`,
  fx: (id: string) => `${APC_DIR.fx}/${fileSegment(id)}.json`,
} as const;

/** One physical file in the tree. `relativePath` is POSIX, always under the `.apc` root. */
export type ApcSourceFile = {
  relativePath: string;
  content: string;
};

/**
 * Inventory + canonical ordering for the tree. We never rely on directory
 * enumeration order (which is filesystem-dependent and would break fingerprint
 * stability); the manifest arrays are the single source of ordering truth.
 */
export type ApcProjectManifest = {
  format: typeof APC_SOURCE_FORMAT;
  version: typeof APC_SOURCE_VERSION;
  savedAt: string;
  trackIds: string[];
  clipIds: string[];
  patternIds: string[];
  fxTrackIds: string[];
};

/** Global, non-timeline project fields (project.json). */
export type ApcProjectFile = Pick<
  ProjectSnapshot,
  | 'bpm'
  | 'masterVolumeDb'
  | 'masterPan'
  | 'snapGrid'
  | 'isRelativeSnapEnabled'
  | 'recordingCountInBeats'
  | 'recordingPreRollBeats'
  | 'isPunchRecordingEnabled'
  | 'isLoopRecordingEnabled'
  | 'recordingLatencyCompensationMs'
  | 'performanceMode'
  | 'looperLengthBars'
  | 'isCycleEnabled'
  | 'cycleStartBeat'
  | 'cycleEndBeat'
  | 'playheadBeat'
  | 'isPlaying'
  | 'scale'
  | 'chord'
>;

/** Timeline-shaped fields (timeline.json). */
export type ApcTimelineFile = Pick<
  ProjectSnapshot,
  'tempoMap' | 'meterMap' | 'timeSignature' | 'sections'
>;

/** Per-track FX + optional amp-sim, stored together in fx/<trackId>.json. */
export type ApcTrackFxFile = {
  fx: TrackFxState;
  ampSim?: TrackAmpSimState;
};

export type ApcCopilotFile = CopilotChatProjectState;

/** In-memory representation of the whole `.apc` tree. */
export type ApcSourceProject = {
  manifest: ApcProjectManifest;
  project: ApcProjectFile;
  timeline: ApcTimelineFile;
  copilot: ApcCopilotFile;
  tracks: Record<string, DAWTrack>;
  clips: Record<string, DAWBlock>;
  patterns: Record<string, DrumPattern>;
  fx: Record<string, ApcTrackFxFile>;
};

export type ApcValidationCode =
  | 'duplicate-id'
  | 'manifest-mismatch'
  | 'dangling-clip-track'
  | 'dangling-pattern'
  | 'routing'
  | 'note-out-of-range'
  | 'note-out-of-clip'
  | 'unsafe-path'
  | 'unsafe-asset-path'
  | 'locked-edit';

export type ApcValidationIssue = {
  code: ApcValidationCode;
  message: string;
  entityId?: string;
  detail?: string;
};

export type ApcCompileResult =
  | {ok: true; snapshot: ProjectSnapshot; warnings: ApcValidationIssue[]}
  | {ok: false; errors: ApcValidationIssue[]};
