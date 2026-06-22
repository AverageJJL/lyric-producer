import {AGENT_PATCH_MAX_CHANGES, type ApcPatchTransaction} from './copilotAgentContract';
import type {ApcAgentTree} from './copilotAgentTools';
import {clipsForSections} from './copilotBuildAudioArrangementClips';
import {
  defaultSections,
  dropoutWindow,
  explicitSections,
  requestedEndBeat,
  sectionMarkers,
  splitForDropout,
} from './copilotBuildAudioArrangementPlan';
import {
  cleanString,
  readJson,
  slug,
  sourceClips,
  treeHash,
  wantsAudioArrangement,
  type ClipFile,
  type SourceClip,
} from './copilotBuildAudioArrangementSource';

export type CopilotBuildAudioArrangementResult = {
  text: string;
  patch: ApcPatchTransaction;
};

function usedClipIds(tree: ApcAgentTree): Set<string> {
  return new Set(Object.keys(tree.files)
    .filter(path => path.startsWith('clips/') && path.endsWith('.json'))
    .map(path => cleanString(readJson<ClipFile>(tree, path)?.id))
    .filter((id): id is string => id !== null));
}

function usedTrackIds(tree: ApcAgentTree): Set<string> {
  return new Set(Object.keys(tree.files)
    .filter(path => path.startsWith('tracks/') && path.endsWith('.json'))
    .map(path => cleanString(readJson<Record<string, unknown>>(tree, path)?.id))
    .filter((id): id is string => id !== null));
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

function guideTrackForSource(tree: ApcAgentTree, source: SourceClip, usedIds: Set<string>) {
  const id = uniqueId(`ai-build-slices-${slug(source.trackId)}`, usedIds);
  const sourceTrack = readJson<Record<string, unknown>>(tree, `tracks/${encodeURIComponent(source.trackId)}.json`) ?? {};
  return {
    id,
    path: `tracks/${id}.json`,
    content: JSON.stringify({
      ...sourceTrack,
      id,
      name: `Build slices - ${source.trackName}`,
      isFrozen: false,
      isLocked: false,
      isMuted: false,
      isRecordArmed: false,
      isSolo: false,
    }),
  };
}

function trackPath(trackId: string): string {
  return `tracks/${encodeURIComponent(trackId)}.json`;
}

export function buildAudioArrangementShortcut(
  message: string,
  tree: ApcAgentTree,
): CopilotBuildAudioArrangementResult | null {
  if (!wantsAudioArrangement(message)) {
    return null;
  }
  const timelineHash = treeHash(tree, 'timeline.json');
  if (!timelineHash) {
    return null;
  }
  const allClips = sourceClips(tree);
  if (allClips.length === 0) {
    return null;
  }

  const explicit = explicitSections(message);
  const endBeat = requestedEndBeat(message, allClips, explicit);
  const dropout = dropoutWindow(message, endBeat);
  const baseSections = explicit.length > 0 ? explicit : defaultSections(endBeat);
  const specs = splitForDropout(baseSections, dropout);
  const overlapping = allClips.filter(clip => clip.startBeat < endBeat && clip.startBeat + clip.lengthBeats > 0);
  const maxSources = Math.max(1, Math.floor((AGENT_PATCH_MAX_CHANGES - 1) / (specs.length + 3)));
  const sources = overlapping.slice(0, maxSources);
  if (sources.length === 0) {
    return null;
  }
  const prefix = `ai-build-${slug(sources[0].id)}`;
  const changes: ApcPatchTransaction['changes'] = [{
    op: 'mergeFields',
    path: 'timeline.json',
    beforeHash: timelineHash,
    fields: {sections: sectionMarkers(tree, specs, prefix)},
  }];

  const usedIds = usedClipIds(tree);
  const tracksBySourceTrackId = new Map<string, string>();
  const usedTracks = usedTrackIds(tree);
  const deletedSourceTrackIds = new Set<string>();
  const deletedSourceClipPaths = new Set<string>();
  sources.forEach(source => {
    if (tracksBySourceTrackId.has(source.trackId)) {
      return;
    }
    const track = guideTrackForSource(tree, source, usedTracks);
    tracksBySourceTrackId.set(source.trackId, track.id);
    changes.push({op: 'createFile', path: track.path, content: track.content});
    const sourcePath = trackPath(source.trackId);
    const beforeHash = treeHash(tree, sourcePath);
    if (beforeHash && !deletedSourceTrackIds.has(source.trackId)) {
      deletedSourceTrackIds.add(source.trackId);
      changes.push({op: 'deleteFile', path: sourcePath, beforeHash});
    }
  });

  sources.forEach(source => {
    if (!deletedSourceClipPaths.has(source.path)) {
      deletedSourceClipPaths.add(source.path);
      changes.push({op: 'deleteFile', path: source.path, beforeHash: source.hash});
    }
  });

  const muteDropout = /\b(mute|remove|silence)\b/i.test(message);
  sources.forEach(source => {
    const guideTrackId = tracksBySourceTrackId.get(source.trackId) ?? source.trackId;
    clipsForSections(source, specs, usedIds, guideTrackId, dropout, muteDropout).forEach(clip => {
      changes.push({op: 'createFile', path: `clips/${clip.id}.json`, content: clip.content});
    });
  });

  if (changes.length <= 1 || changes.length > AGENT_PATCH_MAX_CHANGES) {
    return null;
  }
  const modeText = dropout ? 'split-and-dropout arrangement' : 'split arrangement';
  const text = [
    `Prepared a ${specs.length}-section ${modeText} from ${sources.length} existing audio clip${sources.length === 1 ? '' : 's'}.`,
    'It marks the original full-length source tracks for removal and plays audible slice copies on new Build lanes; no audio, MIDI, or new music is generated.',
  ].join(' ');

  return {
    text,
    patch: {
      schemaVersion: 1,
      baseFingerprint: tree.fingerprint,
      summary: `Stage ${modeText} from existing audio`,
      changes,
    },
  };
}
