import {captureProjectSnapshot, type ProjectSnapshot} from '../arrangement/projectSnapshot';
import {restoreProjectSnapshot} from '../arrangement/projectRestore';
import {applyArrangementOperations} from '../arrangement/operations';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
  runWithoutHistory,
} from '../store/history';
import {refreshPlaybackAndInstruments} from '../native/refreshPlayback';
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
let active: {proposalId: string; editId: string; baseSnapshot: ProjectSnapshot} | null = null;

function applyEdit(edit: StagedEdit): void {
  runWithoutHistory(() => {
    if (edit.kind === 'snapshot') {
      restoreProjectSnapshot(edit.snapshot, STAGING_RESTORE_OPTIONS);
    } else {
      applyArrangementOperations(edit.operations);
    }
  });
}

function restoreBase(): void {
  if (active) {
    runWithoutHistory(() => restoreProjectSnapshot(active!.baseSnapshot, STAGING_RESTORE_OPTIONS));
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
    restoreBase();
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
  active = {proposalId: edit.proposalId, editId: edit.id, baseSnapshot};
  syncStore();
  applyEdit(edit);
}

/** Reject: restore the pre-stage state exactly. Re-syncs native to avoid ghost clips. */
export function revertStagedEdit(): void {
  if (!active) {
    return;
  }
  restoreBase();
  refreshPlaybackAndInstruments();
  active = null;
  syncStore();
}

/** Accept: keep the staged state and record ONE undo checkpoint (undo => pre-stage). */
export function acceptStagedEdit(): void {
  if (!active) {
    return;
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
