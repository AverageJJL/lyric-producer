import type {ArrangementOperation} from './operations';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';

type LockState = {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
};

type ArrangementLockLookup = LockState & {
  blockById: Map<string, DAWBlock>;
  lockedClipTrackIds: Set<string>;
  lockedPatternIds: Set<string>;
  trackLockedById: Map<string, boolean>;
};

function lockLookup(state: LockState): ArrangementLockLookup | null {
  return 'trackLockedById' in state ? state as ArrangementLockLookup : null;
}

export function createArrangementLockLookup(state: LockState): ArrangementLockLookup {
  const trackLockedById = new Map<string, boolean>();
  state.tracks.forEach(track => {
    const locked = track.isLocked || track.isFrozen === true;
    trackLockedById.set(track.id, trackLockedById.get(track.id) === true || locked);
  });

  const blockById = new Map<string, DAWBlock>();
  const lockedClipTrackIds = new Set<string>();
  const lockedPatternIds = new Set<string>();
  state.blocks.forEach(block => {
    if (!blockById.has(block.id)) {
      blockById.set(block.id, block);
    }
    const locked = block.isLocked === true || trackLockedById.get(block.trackId) === true;
    if (locked) {
      lockedClipTrackIds.add(block.trackId);
      if (block.patternId) {
        lockedPatternIds.add(block.patternId);
      }
    }
  });

  return {
    tracks: state.tracks,
    blocks: state.blocks,
    blockById,
    lockedClipTrackIds,
    lockedPatternIds,
    trackLockedById,
  };
}

function trackIsLocked(trackId: string | undefined, state: LockState): boolean {
  if (!trackId) {
    return false;
  }
  const lookup = lockLookup(state);
  if (lookup) {
    return lookup.trackLockedById.get(trackId) === true;
  }
  return state.tracks.some(track =>
    track.id === trackId && (track.isLocked || track.isFrozen === true),
  );
}

function blockForClip(clipId: string, state: LockState): DAWBlock | undefined {
  const lookup = lockLookup(state);
  if (lookup) {
    return lookup.blockById.get(clipId);
  }
  return state.blocks.find(block => block.id === clipId);
}

function blockOrTrackIsLocked(block: DAWBlock | undefined, state: LockState): boolean {
  if (!block) {
    return false;
  }
  return block.isLocked === true || trackIsLocked(block.trackId, state);
}

function patternTouchesLockedClip(patternId: string, state: LockState): boolean {
  const lookup = lockLookup(state);
  if (lookup) {
    return lookup.lockedPatternIds.has(patternId);
  }
  return state.blocks.some(block =>
    block.patternId === patternId && blockOrTrackIsLocked(block, state),
  );
}

/**
 * Constraint locks are for AI/scripted arrangement mutations. Restore operations
 * are intentionally not blocked here because project-open and snapshot replay
 * must be able to recreate a locked asset exactly as saved.
 */
export function shouldSkipLockedArrangementOperation(
  operation: ArrangementOperation,
  state: LockState,
): boolean {
  switch (operation.op) {
    case 'deleteTrack':
      if (lockLookup(state)?.lockedClipTrackIds.has(operation.trackId)) {
        return true;
      }
      return trackIsLocked(operation.trackId, state) ||
        state.blocks.some(block =>
          block.trackId === operation.trackId && blockOrTrackIsLocked(block, state),
        );
    case 'setTrackInstrument':
    case 'setTrackPreset':
    case 'setTrackMix':
      return trackIsLocked(operation.trackId, state);
    case 'deleteClip':
      return blockOrTrackIsLocked(blockForClip(operation.clipId, state), state);
    case 'upsertMidiClip':
    case 'upsertDrumClip': {
      const existing = blockForClip(operation.clip.id, state);
      return trackIsLocked(operation.clip.trackId, state) ||
        blockOrTrackIsLocked(existing, state);
    }
    case 'createSamplerFromSlices':
      return trackIsLocked(operation.trackId, state) ||
        blockOrTrackIsLocked(blockForClip(operation.clipId, state), state);
    case 'moveClip': {
      const block = blockForClip(operation.clipId, state);
      return blockOrTrackIsLocked(block, state) ||
        trackIsLocked(operation.trackId, state);
    }
    case 'resizeClip':
      return blockOrTrackIsLocked(blockForClip(operation.clipId, state), state);
    case 'upsertDrumPattern':
      return patternTouchesLockedClip(operation.pattern.id, state);
    default:
      return false;
  }
}
