import {captureProjectSnapshot, type ProjectSnapshot} from '../arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../arrangement/projectRestore';
import {applyArrangementOperations} from '../arrangement/operations';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
  runWithoutHistory,
} from '../store/history';
import {runWithNativeBridgeSyncSuppressed} from '../store/dawRecording';
import {refreshPlaybackAndInstruments} from '../native/refreshPlayback';
import {
  cancelPendingNativePlaybackForBlockIds,
  deleteNativePlaybackForBlockIdsNow,
  syncNativePlaybackForBlockIdsNow,
} from '../store/useDAWNativeBridge';
import {useCopilotStagingStore} from './copilotStagingStore';
import type {StagedEdit} from './copilotStagedEdit';

const STAGING_RESTORE_OPTIONS = {restoreCopilotChats: false} as const;

/**
 * Cursor-style staging engine.
 *
 * Mechanism (chosen over a parallel transient overlay): we apply the proposed edit
 * into the REAL store under runWithoutHistory, so it is instantly visible, native-
 * synced, and audible under normal transport. `baseSnapshot` is the state captured
 * before the first stage of a proposal — the single source for both revert and the
 * accept checkpoint, which makes swap/reject/accept exact for new blocks, replaced
 * blocks, BPM, and volume alike.
 *
 * Engine snapshot state lives in this module (snapshots are large; they don't belong
 * in reactive store state); only small render-relevant flags go to the staging store.
 */
let active: {
  proposalId: string;
  editId: string;
  baseSnapshot: ProjectSnapshot;
  previewSnapshot?: ProjectSnapshot;
  acceptSnapshot?: ProjectSnapshot;
  skipPlaybackRefresh: boolean;
  previewSkipsNativeSync: boolean;
} | null = null;

function pendingDeletionBlockIds(snapshot?: ProjectSnapshot): string[] {
  return snapshot?.blocks
    .filter(block => block.pendingDeletion === true)
    .map(block => block.id) ?? [];
}

function previewOnlyBlockIds(): string[] {
  if (!active?.previewSnapshot) {
    return [];
  }
  const baseIds = new Set(active.baseSnapshot.blocks.map(block => block.id));
  return active.previewSnapshot.blocks
    .filter(block => !baseIds.has(block.id))
    .map(block => block.id);
}

function blockPreviewKey(block: ProjectSnapshot['blocks'][number]): string {
  const comparable = {...block};
  delete comparable.waveformPeaks;
  return JSON.stringify(comparable);
}

function baseBlockIdsChangedInPreview(): string[] {
  if (!active?.previewSnapshot) {
    return [];
  }
  const previewById = new Map(active.previewSnapshot.blocks.map(block => [block.id, block]));
  return active.baseSnapshot.blocks
    .filter(block => {
      const preview = previewById.get(block.id);
      return preview !== undefined && blockPreviewKey(preview) !== blockPreviewKey(block);
    })
    .map(block => block.id);
}

function previewPlaybackBlockIds(): string[] {
  const pendingIds = new Set(pendingDeletionBlockIds(active?.previewSnapshot));
  const changedIds = baseBlockIdsChangedInPreview().filter(blockId => !pendingIds.has(blockId));
  return [...new Set([...previewOnlyBlockIds(), ...changedIds])];
}

function baseBlockIdsForPendingDeletion(): string[] {
  if (!active?.previewSnapshot) {
    return [];
  }
  const pendingIds = new Set(pendingDeletionBlockIds(active.previewSnapshot));
  return active.baseSnapshot.blocks
    .filter(block => pendingIds.has(block.id))
    .map(block => block.id);
}

function restoreSnapshot(
  snapshot: ProjectSnapshot,
  options: {skipNativeSync: boolean; skipPlaybackRefresh: boolean},
): void {
  const restore = () => restoreProjectSnapshot(snapshot, {
    ...STAGING_RESTORE_OPTIONS,
    skipNativeRefresh: options.skipNativeSync,
    skipPlaybackRefresh: options.skipPlaybackRefresh,
  });
  if (options.skipNativeSync) {
    runWithNativeBridgeSyncSuppressed(restore);
  } else {
    restore();
  }
}

function applyEdit(edit: StagedEdit): void {
  runWithoutHistory(() => {
    if (edit.kind === 'snapshot') {
      restoreSnapshot(edit.snapshot, {
        skipNativeSync: edit.previewSkipsNativeSync === true,
        skipPlaybackRefresh: edit.skipPlaybackRefresh === true,
      });
    } else {
      applyArrangementOperations(edit.operations);
    }
  });
  if (edit.kind === 'snapshot' && edit.previewSkipsNativeSync !== true) {
    syncNativePlaybackForBlockIdsNow(previewPlaybackBlockIds());
    deleteNativePlaybackForBlockIdsNow(pendingDeletionBlockIds(edit.snapshot));
  }
}

function restoreBase(): void {
  if (active) {
    runWithoutHistory(() => restoreSnapshot(active!.baseSnapshot, {
      skipNativeSync: active!.previewSkipsNativeSync,
      skipPlaybackRefresh: active!.skipPlaybackRefresh,
    }));
  }
}

function syncStore(): void {
  useCopilotStagingStore.getState().setActiveStaged(active?.editId ?? null, active !== null);
}

/** Stage (or swap to) an edit. Only one edit is ever live; staging reverts any prior. */
export function stageCopilotEdit(edit: StagedEdit): void {
  let baseSnapshot: ProjectSnapshot;
  if (active) {
    const sameProposal = active.proposalId === edit.proposalId;
    const previewIds = previewPlaybackBlockIds();
    const changedIds = baseBlockIdsChangedInPreview();
    const restoreIds = [...new Set([...baseBlockIdsForPendingDeletion(), ...changedIds])];
    if (!active.previewSkipsNativeSync) {
      cancelPendingNativePlaybackForBlockIds(previewIds);
    }
    restoreBase();
    if (!active.previewSkipsNativeSync) {
      syncNativePlaybackForBlockIdsNow(restoreIds);
    }
    // Same proposal => keep the original base so accept-after-swaps is one checkpoint.
    // Different proposal => the prior was reverted, so the current state is the new base.
    baseSnapshot = sameProposal ? active.baseSnapshot : captureProjectSnapshot();
  } else {
    baseSnapshot = captureProjectSnapshot();
  }
  // Flag pending (stagePending=true) BEFORE mutating the DAW store. applyEdit fires the
  // project-lifecycle dirty subscriber synchronously; if pending were still false there,
  // it would autosave this un-accepted preview. Setting active + syncing first closes
  // that race — the subscriber sees isCopilotStagePending() === true and skips autosave.
  active = {
    proposalId: edit.proposalId,
    editId: edit.id,
    baseSnapshot,
    previewSnapshot: edit.kind === 'snapshot' ? edit.snapshot : undefined,
    acceptSnapshot: edit.kind === 'snapshot' ? edit.acceptSnapshot : undefined,
    skipPlaybackRefresh: edit.kind === 'snapshot' && edit.skipPlaybackRefresh === true,
    previewSkipsNativeSync: edit.kind === 'snapshot' && edit.previewSkipsNativeSync === true,
  };
  syncStore();
  applyEdit(edit);
}

/** Reject: restore the pre-stage state exactly. Re-syncs native to avoid ghost clips. */
export function revertStagedEdit(): void {
  if (!active) {
    return;
  }
  const previewIds = previewPlaybackBlockIds();
  const changedIds = baseBlockIdsChangedInPreview();
  const restoreIds = [...new Set([...baseBlockIdsForPendingDeletion(), ...changedIds])];
  const shouldRefreshNative = !active.previewSkipsNativeSync && !active.skipPlaybackRefresh;
  if (!active.previewSkipsNativeSync) {
    cancelPendingNativePlaybackForBlockIds(previewIds);
  }
  restoreBase();
  if (!active.previewSkipsNativeSync) {
    syncNativePlaybackForBlockIdsNow(restoreIds);
  }
  if (shouldRefreshNative) {
    refreshPlaybackAndInstruments();
  }
  active = null;
  syncStore();
}

/** Accept: keep the staged state and record ONE undo checkpoint (undo => pre-stage). */
export function acceptStagedEdit(): void {
  if (!active) {
    return;
  }
  if (active.acceptSnapshot) {
    runWithoutHistory(() => restoreSnapshot(active!.acceptSnapshot!, {
      skipNativeSync: active!.previewSkipsNativeSync,
      skipPlaybackRefresh: active!.skipPlaybackRefresh,
    }));
  }
  recordArrangementHistory(captureArrangementHistorySnapshot(active.baseSnapshot));
  active = null;
  syncStore();
}

export function activeStagedEdit(): {proposalId: string; editId: string} | null {
  return active ? {proposalId: active.proposalId, editId: active.editId} : null;
}

/** Test helper — reset engine + store between cases. */
export function resetCopilotStagingForTests(): void {
  active = null;
  useCopilotStagingStore.setState({
    stagedProposal: null,
    activeStagedEditId: null,
    stagePending: false,
  });
}
