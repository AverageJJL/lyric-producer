import React from 'react';

import type {CopilotChatSession} from '../../assistant/copilotChatHistory';

type CopilotHistoryToolbarProps = {
  activeSessionId: string;
  isHistoryOpen: boolean;
  isPending: boolean;
  sessions: CopilotChatSession[];
  onNewChat: () => void;
  onSelectSession: (sessionId: string) => void;
  onToggleHistory: () => void;
};

function sessionSummary(session: CopilotChatSession): string {
  const count = session.messages.length;
  return `${count} message${count === 1 ? '' : 's'}`;
}

export function CopilotHistoryToolbar({
  activeSessionId,
  isHistoryOpen,
  isPending,
  sessions,
  onNewChat,
  onSelectSession,
  onToggleHistory,
}: CopilotHistoryToolbarProps) {
  const historySessions = sessions.filter(session => session.messages.length > 0);
  return (
    <div className="copilot-history-shell">
      <div className="copilot-history-toolbar" aria-label="Copilot chat controls">
        <button type="button" disabled={isPending} onClick={onNewChat}>
          <span aria-hidden="true">+</span>
          New Chat
        </button>
        <button
          type="button"
          aria-expanded={isHistoryOpen}
          disabled={historySessions.length === 0 || isPending}
          onClick={onToggleHistory}>
          History
        </button>
      </div>
      {isHistoryOpen ? (
        <div className="copilot-history-list" role="listbox" aria-label="Copilot chat history">
          {historySessions.length === 0 ? (
            <p>No saved chats yet.</p>
          ) : historySessions.map(session => (
            <button
              key={session.id}
              type="button"
              role="option"
              aria-selected={session.id === activeSessionId}
              className={session.id === activeSessionId ? 'active' : ''}
              disabled={isPending}
              onClick={() => onSelectSession(session.id)}>
              <strong>{session.title}</strong>
              <span>{sessionSummary(session)}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
