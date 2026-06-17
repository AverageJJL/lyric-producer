import type {ArrangementOperation} from './operations';
import type {DAWBlock, DAWTrack} from '../store/useDAWStore';

type LockState = {
  tracks: DAWTrack[];
  blocks: DAWBlock[];
};

function trackIsLocked(trackId: string | undefined, state: LockState): boolean {
  if (!trackId) {
    return false;
  }
  return state.tracks.some(track =>
    track.id === trackId && (track.isLocked || track.isFrozen === true),
  );
}

function blockForClip(clipId: string, state: LockState): DAWBlock | undefined {
  return state.blocks.find(block => block.id === clipId);
}

function blockOrTrackIsLocked(block: DAWBlock | undefined, state: LockState): boolean {
  if (!block) {
    return false;
  }
  return block.isLocked === true || trackIsLocked(block.trackId, state);
}

function patternTouchesLockedClip(patternId: string, state: LockState): boolean {
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
      return trackIsLocked(operation.trackId, state) ||
        state.blocks.some(block =>
          block.trackId === operation.trackId && blockOrTrackIsLocked(block, state),
        );
    case 'setTrackInstrument':
    case 'setTrackPreset':
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
