import {useCopilotStagingController} from './useCopilotStagingController';

/**
 * Cursor-style preview card for an AI-proposed edit set. Each option can be STAGED
 * directly into the live workspace (visible + audible under normal transport); the
 * user listens, swaps to another option, rejects (revert), or accepts (commit as one
 * undoable step). Renders nothing when no proposal is pending.
 */
export function CopilotStagedProposalCard() {
  const {stagedProposal, activeStagedEditId, stagePending, stage, accept, reject} =
    useCopilotStagingController();

  if (!stagedProposal) {
    return null;
  }

  return (
    <article className="copilot-message assistant copilot-staged-proposal">
      <span className="copilot-message-role">Copilot</span>
      <p className="copilot-staged-proposal__title">{stagedProposal.title}</p>
      {stagePending ? (
        <p className="copilot-staged-proposal__banner">
          Staged into the workspace — play to listen, then Accept or Reject.
        </p>
      ) : null}
      <ul className="copilot-staged-proposal__options">
        {stagedProposal.edits.map(edit => {
          const isStaged = edit.id === activeStagedEditId;
          return (
            <li
              key={edit.id}
              className={`copilot-staged-proposal__option${isStaged ? ' is-staged' : ''}`}
            >
              <div className="copilot-staged-proposal__label">{edit.label}</div>
              {edit.summary.length > 0 ? (
                <ul className="copilot-staged-proposal__summary">
                  {edit.summary.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {isStaged ? (
                <div className="copilot-staged-proposal__actions">
                  <button type="button" className="copilot-accept" onClick={accept}>
                    Accept
                  </button>
                  <button type="button" className="copilot-reject" onClick={reject}>
                    Reject
                  </button>
                </div>
              ) : (
                <button type="button" className="copilot-stage" onClick={() => stage(edit)}>
                  {stagePending ? 'Swap to this' : 'Stage & listen'}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </article>
  );
}
