import {create} from 'zustand';
import type {StagedProposal} from './copilotStagedEdit';

/**
 * Small dedicated store for the Copilot staging UI. Kept SEPARATE from the main DAW
 * store on purpose: staging state is transient preview chrome (which proposal is
 * showing, which option is live in the workspace, whether a stage is pending) and
 * must never enter the project snapshot/fingerprint or undo history. Keeping it out
 * of useDAWStore also means PROJECT_SNAPSHOT_SOURCE_KEYS need not change.
 */
export type CopilotStagingState = {
  stagedProposal: StagedProposal | null;
  activeStagedEditId: string | null;
  stagePending: boolean;
  setStagedProposal: (proposal: StagedProposal | null) => void;
  setActiveStaged: (editId: string | null, pending: boolean) => void;
};

export const useCopilotStagingStore = create<CopilotStagingState>(set => ({
  stagedProposal: null,
  activeStagedEditId: null,
  stagePending: false,
  setStagedProposal: proposal =>
    set({stagedProposal: proposal, activeStagedEditId: null, stagePending: false}),
  setActiveStaged: (editId, pending) => set({activeStagedEditId: editId, stagePending: pending}),
}));

/** Read stagePending without subscribing (used by the autosave gate). */
export function isCopilotStagePending(): boolean {
  return useCopilotStagingStore.getState().stagePending;
}
