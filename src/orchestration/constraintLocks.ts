import type {ProjectSnapshot} from '../arrangement/projectSnapshot';

export type LockedTrackContext = {
  trackId: string;
  name: string;
  type: string;
  reason: 'track_locked';
};

export type LockedClipContext = {
  clipId: string;
  trackId: string;
  name: string;
  type: string;
  reason: 'clip_locked' | 'parent_track_locked';
};

export type ConstraintLockContext = {
  nonMutableTracks: LockedTrackContext[];
  nonMutableClips: LockedClipContext[];
  rules: string[];
};

export function constraintLockContextFromSnapshot(
  snapshot: ProjectSnapshot,
): ConstraintLockContext {
  const lockedTrackIds = new Set(
    snapshot.tracks.filter(track => track.isLocked).map(track => track.id),
  );

  return {
    nonMutableTracks: snapshot.tracks
      .filter(track => track.isLocked)
      .map(track => ({
        trackId: track.id,
        name: track.name,
        type: track.type,
        reason: 'track_locked' as const,
      })),
    nonMutableClips: snapshot.blocks
      .filter(block => block.isLocked === true || lockedTrackIds.has(block.trackId))
      .map(block => ({
        clipId: block.id,
        trackId: block.trackId,
        name: block.name,
        type: block.type,
        reason: block.isLocked === true ? 'clip_locked' : 'parent_track_locked',
      })),
    rules: [
      'Do not delete, move, resize, rename, replace, re-instrument, or overwrite non-mutable tracks.',
      'Do not delete, move, resize, rename, replace, or overwrite non-mutable clips.',
      'Create new tracks or clips instead of mutating locked assets.',
    ],
  };
}
