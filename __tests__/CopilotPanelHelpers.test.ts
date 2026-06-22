import {clearStaleStagedProposal} from '../src/web/components/CopilotPanelHelpers';
import {resetCopilotStagingForTests} from '../src/assistant/copilotStaging';
import {useCopilotStagingStore} from '../src/assistant/copilotStagingStore';

describe('CopilotPanelHelpers', () => {
  afterEach(() => {
    resetCopilotStagingForTests();
  });

  it('clears stale staged proposal chrome', () => {
    useCopilotStagingStore.getState().setStagedProposal({
      proposalId: 'P',
      title: 'Stale edit',
      edits: [],
    });

    clearStaleStagedProposal();

    expect(useCopilotStagingStore.getState().stagedProposal).toBeNull();
  });
});
