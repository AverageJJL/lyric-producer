import {revertStagedEdit} from '../../assistant/copilotStaging';
import {isCopilotStagePending, useCopilotStagingStore} from '../../assistant/copilotStagingStore';

export function clearStaleStagedProposal(): void {
  if (isCopilotStagePending()) {
    revertStagedEdit();
  }
  useCopilotStagingStore.getState().setStagedProposal(null);
}
