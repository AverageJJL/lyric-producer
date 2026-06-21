import {canonicalJsonStringify} from '../canonicalJson';
import type {ProjectSnapshot} from '../projectSnapshot';
import {isProjectManagedAudioPath} from '../mediaConsolidation';
import type {DAWBlock} from '../../store/useDAWStore';
import type {TrackAmpSimState} from '../../native/ampSimContract';
import {
  APC_PATHS,
  APC_SOURCE_FORMAT,
  APC_SOURCE_VERSION,
  type ApcProjectFile,
  type ApcLyricsFile,
  type ApcSourceFile,
  type ApcSourceProject,
  type ApcTimelineFile,
  type ApcTrackFxFile,
} from './apcSourceTypes';

const FALLBACK_SAVED_AT = '1970-01-01T00:00:00.000Z';

function projectFileFromSnapshot(snapshot: ProjectSnapshot): ApcProjectFile {
  return {
    bpm: snapshot.bpm,
    masterVolumeDb: snapshot.masterVolumeDb,
    masterPan: snapshot.masterPan,
    snapGrid: snapshot.snapGrid,
    isRelativeSnapEnabled: snapshot.isRelativeSnapEnabled,
    recordingCountInBeats: snapshot.recordingCountInBeats,
    recordingPreRollBeats: snapshot.recordingPreRollBeats,
    isPunchRecordingEnabled: snapshot.isPunchRecordingEnabled,
    isLoopRecordingEnabled: snapshot.isLoopRecordingEnabled,
    recordingLatencyCompensationMs: snapshot.recordingLatencyCompensationMs,
    performanceMode: snapshot.performanceMode,
    looperLengthBars: snapshot.looperLengthBars,
    isCycleEnabled: snapshot.isCycleEnabled,
    cycleStartBeat: snapshot.cycleStartBeat,
    cycleEndBeat: snapshot.cycleEndBeat,
    playheadBeat: snapshot.playheadBeat,
    isPlaying: snapshot.isPlaying,
    scale: snapshot.scale,
    chord: snapshot.chord,
  };
}

function timelineFileFromSnapshot(snapshot: ProjectSnapshot): ApcTimelineFile {
  return {
    tempoMap: snapshot.tempoMap,
    meterMap: snapshot.meterMap,
    timeSignature: snapshot.timeSignature,
    sections: snapshot.sections,
  };
}

function lyricsFileFromSnapshot(snapshot: ProjectSnapshot): ApcLyricsFile {
  return snapshot.lyrics;
}

function clipFileFromSnapshot(block: DAWBlock): DAWBlock {
  if (block.type !== 'audio' || !isProjectManagedAudioPath(block.audioFilePath)) {
    return block;
  }
  const projectManagedClip = {...block};
  delete projectManagedClip.absoluteAudioFilePath;
  return projectManagedClip;
}

/**
 * Split a {@link ProjectSnapshot} into the in-memory `.apc` tree.
 *
 * Ordering is captured explicitly in the manifest arrays (track/clip order, FX
 * order) so recompiling never depends on object-key or directory enumeration
 * order. Derived fields (`mediaReferences`, `fxSummaries`) are intentionally NOT
 * stored — the compiler regenerates them so they can never drift.
 */
export function decomposeSnapshotToApcSource(
  snapshot: ProjectSnapshot,
  savedAt: string = FALLBACK_SAVED_AT,
): ApcSourceProject {
  const tracks: ApcSourceProject['tracks'] = {};
  snapshot.tracks.forEach(track => {
    tracks[track.id] = track;
  });

  const clips: ApcSourceProject['clips'] = {};
  snapshot.blocks.forEach(block => {
    clips[block.id] = clipFileFromSnapshot(block);
  });

  const patterns: ApcSourceProject['patterns'] = {...snapshot.patterns};

  // Amp-sim state is per voice track; co-locate it with that track's FX file.
  const ampByTrack = new Map<string, TrackAmpSimState>(
    snapshot.ampSimStates.map(state => [state.trackId, state]),
  );
  const fx: ApcSourceProject['fx'] = {};
  snapshot.fxStates.forEach(state => {
    const file: ApcTrackFxFile = {fx: state};
    const ampSim = ampByTrack.get(state.trackId);
    if (ampSim) {
      file.ampSim = ampSim;
    }
    fx[state.trackId] = file;
  });

  return {
    manifest: {
      format: APC_SOURCE_FORMAT,
      version: APC_SOURCE_VERSION,
      savedAt,
      trackIds: snapshot.tracks.map(track => track.id),
      clipIds: snapshot.blocks.map(block => block.id),
      patternIds: Object.keys(snapshot.patterns),
      fxTrackIds: snapshot.fxStates.map(state => state.trackId),
    },
    project: projectFileFromSnapshot(snapshot),
    timeline: timelineFileFromSnapshot(snapshot),
    lyrics: lyricsFileFromSnapshot(snapshot),
    copilot: snapshot.copilotChats,
    tracks,
    clips,
    patterns,
    fx,
  };
}

/**
 * Flatten the in-memory tree into the list of physical files to write to disk.
 * Every file's content is key-sorted JSON so byte output is stable across saves
 * (a prerequisite for small, meaningful diffs and fingerprint stability).
 */
export function serializeApcSource(source: ApcSourceProject): ApcSourceFile[] {
  const files: ApcSourceFile[] = [
    {relativePath: APC_PATHS.manifest, content: canonicalJsonStringify(source.manifest)},
    {relativePath: APC_PATHS.project, content: canonicalJsonStringify(source.project)},
    {relativePath: APC_PATHS.timeline, content: canonicalJsonStringify(source.timeline)},
    {relativePath: APC_PATHS.lyrics, content: canonicalJsonStringify(source.lyrics)},
  ];
  if (source.copilot.sessions.length > 0 || source.copilot.activeSessionId !== null) {
    files.push({relativePath: APC_PATHS.copilot, content: canonicalJsonStringify(source.copilot)});
  }
  source.manifest.trackIds.forEach(id => {
    const track = source.tracks[id];
    if (track) {
      files.push({relativePath: APC_PATHS.track(id), content: canonicalJsonStringify(track)});
    }
  });
  source.manifest.clipIds.forEach(id => {
    const clip = source.clips[id];
    if (clip) {
      files.push({relativePath: APC_PATHS.clip(id), content: canonicalJsonStringify(clip)});
    }
  });
  source.manifest.patternIds.forEach(id => {
    const pattern = source.patterns[id];
    if (pattern) {
      files.push({relativePath: APC_PATHS.pattern(id), content: canonicalJsonStringify(pattern)});
    }
  });
  source.manifest.fxTrackIds.forEach(id => {
    const file = source.fx[id];
    if (file) {
      files.push({relativePath: APC_PATHS.fx(id), content: canonicalJsonStringify(file)});
    }
  });
  return files;
}
