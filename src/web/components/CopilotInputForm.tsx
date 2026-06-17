import React from 'react';

import {SendHorizontalIcon} from './icons/WorkspaceIcons';

type CopilotInputFormProps = {
  draft: string;
  isPending: boolean;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onDraftChange: (value: string) => void;
  onSend: () => void;
};

export function CopilotInputForm({
  draft,
  isPending,
  textareaRef,
  onDraftChange,
  onSend,
}: CopilotInputFormProps) {
  return (
    <form
      className="copilot-input-row"
      onSubmit={event => {
        event.preventDefault();
        onSend();
      }}>
      <label className="sr-only" htmlFor="copilot-message">
        Message Copilot
      </label>
      <textarea
        id="copilot-message"
        ref={textareaRef}
        value={draft}
        rows={2}
        placeholder="Message Copilot"
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
        disabled={isPending || draft.trim().length === 0}>
        <SendHorizontalIcon className="copilot-send-icon" />
      </button>
    </form>
  );
}
