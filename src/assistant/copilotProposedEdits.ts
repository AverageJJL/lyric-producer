import {applyApcPatch, type ApcPatchTransaction} from './copilotPatchApply';
import {stagedEditFromSnapshot, type StagedProposal} from './copilotStagedEdit';

/**
 * Boundary between the agent harness and the staging layer. The harness hands off a
 * validated patch; this converts it into a previewable StagedProposal by compiling
 * the proposed project snapshot. Both the new agent path and the legacy option cards
 * converge on StagedProposal so the same stage/accept/reject UX serves all of them.
 */
export type ProposedFromPatchResult =
  | {ok: true; proposal: StagedProposal}
  | {ok: false; error: string};

export function stagedProposalFromPatch(
  proposalId: string,
  patch: ApcPatchTransaction,
): ProposedFromPatchResult {
  const result = applyApcPatch(patch);
  if (!result.ok) {
    const reason =
      result.conflicts.map(conflict => conflict.reason).join('; ') ||
      result.errors?.map(issue => issue.message).join('; ') ||
      'The proposed edit could not be applied.';
    return {ok: false, error: reason};
  }
  const title = patch.summary || 'AI edit';
  const edit = stagedEditFromSnapshot(
    {
      id: `${proposalId}-edit`,
      proposalId,
      label: title,
      summary: patch.changes.map(change => `${change.op} ${change.path}`),
    },
    result.snapshot,
  );
  return {ok: true, proposal: {proposalId, title, edits: [edit]}};
}
