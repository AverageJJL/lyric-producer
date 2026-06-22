import {applyApcPatch, type ApcPatchTransaction} from './copilotPatchApply';
import {stagedEditFromSnapshot, type StagedProposal} from './copilotStagedEdit';
import {captureProjectSnapshot, type ProjectSnapshot} from '../arrangement/projectSnapshot';
import {mediaReferencesFromBlocks} from '../arrangement/mediaReferences';

/**
 * Boundary between the agent harness and the staging layer. The harness hands off a
 * validated patch; this converts it into a previewable StagedProposal by compiling
 * the proposed project snapshot. Both the new agent path and the legacy option cards
 * converge on StagedProposal so the same stage/accept/reject UX serves all of them.
 */
export type ProposedFromPatchResult =
  | {ok: true; proposal: StagedProposal}
  | {ok: false; error: string};

function changeLine(change: ApcPatchTransaction['changes'][number]): string {
  return `${change.op} ${change.path}`;
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

export function summarizePatchChanges(changes: ApcPatchTransaction['changes']): string[] {
  const used = new Set<number>();
  const lines: string[] = [];
  const timelineCount = changes.filter((change, index) => {
    const match = change.op === 'mergeFields' && change.path === 'timeline.json';
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (timelineCount > 0) {
    lines.push(timelineCount === 1 ? 'Update timeline sections' : `Update ${timelineCount} timeline files`);
  }
  const mutedTrackCount = changes.filter((change, index) => {
    const match = change.op === 'mergeFields' &&
      change.path.startsWith('tracks/') &&
      change.fields.isMuted === true;
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (mutedTrackCount > 0) {
    lines.push(`Mute ${plural(mutedTrackCount, 'original source track')}`);
  }
  const deletedTrackCount = changes.filter((change, index) => {
    const match = change.op === 'deleteFile' && change.path.startsWith('tracks/');
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (deletedTrackCount > 0) {
    lines.push(`Remove ${plural(deletedTrackCount, 'original source track')}`);
  }
  const deletedClipCount = changes.filter((change, index) => {
    const match = change.op === 'deleteFile' && change.path.startsWith('clips/');
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (deletedClipCount > 0) {
    lines.push(`Remove ${plural(deletedClipCount, 'full-length source clip')}`);
  }
  const buildLaneCount = changes.filter((change, index) => {
    if (change.op !== 'createFile' || !change.path.startsWith('tracks/')) {
      return false;
    }
    const content = parseJsonObject(change.content);
    const match = typeof content?.name === 'string' && content.name.startsWith('Build slices - ');
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (buildLaneCount > 0) {
    lines.push(`Create ${plural(buildLaneCount, 'Build slice lane')}`);
  }
  const clipCount = changes.filter((change, index) => {
    const match = change.op === 'createFile' && change.path.startsWith('clips/');
    if (match) {
      used.add(index);
    }
    return match;
  }).length;
  if (clipCount > 0) {
    lines.push(`Create ${plural(clipCount, 'audible audio slice clip')}`);
  }
  const otherCount = changes.length - used.size;
  if (otherCount > 0) {
    lines.push(`${plural(otherCount, 'additional project change')}`);
  }
  return lines.length > 0 ? lines : changes.map(changeLine);
}

function idFromEntityPath(path: string, dir: 'tracks' | 'clips'): string | null {
  const prefix = `${dir}/`;
  if (!path.startsWith(prefix) || !path.endsWith('.json')) {
    return null;
  }
  try {
    return decodeURIComponent(path.slice(prefix.length, -'.json'.length));
  } catch {
    return null;
  }
}

function pendingDeletionPreview(
  base: ProjectSnapshot,
  finalSnapshot: ProjectSnapshot,
  patch: ApcPatchTransaction,
): ProjectSnapshot | null {
  const deletedTrackIds = new Set<string>();
  const deletedClipIds = new Set<string>();
  patch.changes.forEach(change => {
    if (change.op !== 'deleteFile') {
      return;
    }
    const trackId = idFromEntityPath(change.path, 'tracks');
    const clipId = idFromEntityPath(change.path, 'clips');
    if (trackId) deletedTrackIds.add(trackId);
    if (clipId) deletedClipIds.add(clipId);
  });
  if (deletedTrackIds.size === 0 && deletedClipIds.size === 0) {
    return null;
  }
  const finalBlockIds = new Set(finalSnapshot.blocks.map(block => block.id));
  const pendingTracks = new Set<string>();
  const tracks = [
    ...base.tracks.map(track => {
      const finalTrack = finalSnapshot.tracks.find(item => item.id === track.id);
      if (finalTrack) return finalTrack;
      if (!deletedTrackIds.has(track.id)) return null;
      pendingTracks.add(track.id);
      return {...track, isMuted: true, isDisabled: true, pendingDeletion: true};
    }).filter((track): track is ProjectSnapshot['tracks'][number] => track !== null),
    ...finalSnapshot.tracks.filter(track => !base.tracks.some(item => item.id === track.id)),
  ];
  const pendingBlocks = base.blocks
    .filter(block =>
      !finalBlockIds.has(block.id) &&
      (deletedClipIds.has(block.id) || deletedTrackIds.has(block.trackId)),
    )
    .map(block => ({
      ...block,
      isMuted: true,
      pendingDeletion: true,
      color: '#5b6168',
    }));
  if (pendingTracks.size === 0 && pendingBlocks.length === 0) {
    return null;
  }
  const blocks = [...finalSnapshot.blocks, ...pendingBlocks];
  return {
    ...finalSnapshot,
    tracks,
    blocks,
    mediaReferences: mediaReferencesFromBlocks(blocks),
    fxStates: [
      ...finalSnapshot.fxStates,
      ...base.fxStates.filter(state => pendingTracks.has(state.trackId)),
    ],
    ampSimStates: [
      ...finalSnapshot.ampSimStates,
      ...base.ampSimStates.filter(state => pendingTracks.has(state.trackId)),
    ],
  };
}

function createsFileBackedAudioClip(change: ApcPatchTransaction['changes'][number]): boolean {
  if (change.op !== 'createFile' || !change.path.startsWith('clips/')) {
    return false;
  }
  const clip = parseJsonObject(change.content);
  return clip?.type === 'audio' && typeof clip.audioFilePath === 'string';
}

function prefersBridgeSync(change: ApcPatchTransaction['changes'][number]): boolean {
  return createsFileBackedAudioClip(change) ||
    change.path.startsWith('clips/') ||
    (change.op === 'deleteFile' && change.path.startsWith('tracks/'));
}

export function stagedProposalFromPatch(
  proposalId: string,
  patch: ApcPatchTransaction,
): ProposedFromPatchResult {
  const baseSnapshot = captureProjectSnapshot();
  const result = applyApcPatch(patch);
  if (!result.ok) {
    const reason =
      result.conflicts.map(conflict => conflict.reason).join('; ') ||
      result.errors?.map(issue => issue.message).join('; ') ||
      'The proposed edit could not be applied.';
    return {ok: false, error: reason};
  }
  const title = patch.summary || 'AI edit';
  const previewSnapshot = pendingDeletionPreview(baseSnapshot, result.snapshot, patch);
  const skipPlaybackRefresh = patch.changes.some(prefersBridgeSync);
  const edit = stagedEditFromSnapshot(
    {
      id: `${proposalId}-edit`,
      proposalId,
      label: title,
      summary: summarizePatchChanges(patch.changes),
    },
    previewSnapshot ?? result.snapshot,
    {
      acceptSnapshot: previewSnapshot ? result.snapshot : undefined,
      skipPlaybackRefresh,
    },
  );
  return {ok: true, proposal: {proposalId, title, edits: [edit]}};
}
