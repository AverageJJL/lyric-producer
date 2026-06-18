import {useCopilotStagingStore} from '../../assistant/copilotStagingStore';
import {
  acceptStagedEdit,
  revertStagedEdit,
  stageCopilotEdit,
} from '../../assistant/copilotStaging';
import type {StagedEdit} from '../../assistant/copilotStagedEdit';

/**
 * React binding for the staging engine. Exposes the current proposal + which option
 * is live, plus stage/swap/accept/reject. Accept and reject both clear the proposal
 * so the cards collapse once the user has decided.
 */
export function useCopilotStagingController() {
  const stagedProposal = useCopilotStagingStore(state => state.stagedProposal);
  const activeStagedEditId = useCopilotStagingStore(state => state.activeStagedEditId);
  const stagePending = useCopilotStagingStore(state => state.stagePending);
  const setStagedProposal = useCopilotStagingStore(state => state.setStagedProposal);

  return {
    stagedProposal,
    activeStagedEditId,
    stagePending,
    dismiss: () => setStagedProposal(null),
    stage: (edit: StagedEdit) => stageCopilotEdit(edit),
    accept: () => {
      acceptStagedEdit();
      setStagedProposal(null);
    },
    reject: () => {
      revertStagedEdit();
      setStagedProposal(null);
    },
  };
}
