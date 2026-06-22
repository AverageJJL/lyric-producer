import {useCopilotStagingController} from './useCopilotStagingController';
import {useNativeAudioSyncStatusStore} from '../../store/nativeAudioSyncStatus';

/**
 * Compact proposal card for an already-staged AI edit. Build proposals auto-stage as
 * soon as they arrive, so this card only has to explain what changed and expose the
 * decision. Multi-option proposals can still swap which edit is live.
 */
export function CopilotStagedProposalCard() {
  const {stagedProposal, activeStagedEditId, stage, accept, reject} =
    useCopilotStagingController();
  const isPreparingAudioPreview = useNativeAudioSyncStatusStore(
    state => state.preparingAudioPreviewCount > 0,
  );

  if (!stagedProposal) {
    return null;
  }

  const activeEdit =
    stagedProposal.edits.find(edit => edit.id === activeStagedEditId) ??
    stagedProposal.edits[0];
  const hasMultipleEdits = stagedProposal.edits.length > 1;

  return (
    <article className="copilot-message assistant copilot-staged-proposal" aria-label="Co-producer proposed edit">
      <span className="copilot-message-role">Co-producer</span>
      <p className="copilot-staged-proposal__title">{stagedProposal.title}</p>
      {isPreparingAudioPreview ? (
        <p className="copilot-staged-proposal__status">Preparing audio preview...</p>
      ) : null}
      {activeEdit?.summary.length ? (
        <ul className="copilot-staged-proposal__summary">
          {activeEdit.summary.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : null}
      {hasMultipleEdits ? (
        <div className="copilot-staged-proposal__option-controls" aria-label="Proposal options">
          {stagedProposal.edits.map(edit => {
            const isActive = edit.id === activeEdit?.id;
            return (
              <button
                key={edit.id}
                type="button"
                className={`copilot-option${isActive ? ' is-active' : ''}`}
                onClick={() => stage(edit)}
                disabled={isActive}
              >
                Use {edit.label}
              </button>
            );
          })}
        </div>
      ) : null}
      <div className="copilot-staged-proposal__actions">
        <button type="button" className="copilot-accept" onClick={accept}>
          Accept
        </button>
        <button type="button" className="copilot-reject" onClick={reject}>
          Reject
        </button>
      </div>
    </article>
  );
}
