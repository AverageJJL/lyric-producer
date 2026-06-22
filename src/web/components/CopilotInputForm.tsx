import React from 'react';

import type {CopilotDemoUsage} from '../../native/copilotApi';
import {SendHorizontalIcon} from './icons/WorkspaceIcons';

type CopilotInputFormProps = {
  draft: string;
  isPending: boolean;
  demoUsage?: CopilotDemoUsage | null;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

export function CopilotInputForm({
  draft,
  isPending,
  demoUsage,
  textareaRef,
  onDraftChange,
  onSend,
}: CopilotInputFormProps) {
  const canSend = draft.trim().length > 0 && !isPending;

  return (
    <form
      className="copilot-input-row"
      onSubmit={event => {
        event.preventDefault();
        onSend();
      }}>
      <textarea
        id="copilot-message"
        ref={textareaRef}
        aria-label="Message Co-producer"
        placeholder="Message Co-producer"
        rows={2}
        value={draft}
        onChange={event => onDraftChange(event.currentTarget.value)}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onSend();
          }
        }}
      />
      <button
        type="submit"
        aria-label="Send message"
        title="Send message"
        disabled={!canSend}>
        <SendHorizontalIcon className="copilot-send-icon" />
      </button>
      {demoUsage?.enabled ? (
        <small className="copilot-demo-usage">
          Demo Copilot: {demoUsage.remaining}/{demoUsage.limit} live messages left
        </small>
      ) : null}
    </form>
  );
}
