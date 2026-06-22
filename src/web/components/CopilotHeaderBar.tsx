import React, {useEffect, useRef} from 'react';

import type {CopilotChatSession} from '../../assistant/copilotChatHistory';
import type {CopilotMode} from '../../native/copilotApi';
import {
  CheckIcon,
  ChevronDownIcon,
  ClockHistoryIcon,
  PlusIcon,
} from './icons/WorkspaceIcons';

type CopilotHeaderBarProps = {
  mode: CopilotMode;
  isModeMenuOpen: boolean;
  isHistoryOpen: boolean;
  isPending: boolean;
  sessions: CopilotChatSession[];
  activeSessionId: string;
  onSelectMode: (mode: CopilotMode) => void;
  onToggleModeMenu: () => void;
  onCloseMenus: () => void;
  onNewChat: () => void;
  onToggleHistory: () => void;
  onSelectSession: (sessionId: string) => void;
};

// Mirrors Cursor's agent picker: a single labelled trigger that drops a small
// menu. Build can edit the project; Ask is the read-only session companion.
const MODE_OPTIONS: {id: CopilotMode; label: string; hint: string}[] = [
  {id: 'build', label: 'Build', hint: 'Build mode: Co-producer can propose and apply edits.'},
  {id: 'ask', label: 'Ask', hint: 'Read-only: ask questions about your session; never edits the project.'},
];

function sessionSummary(session: CopilotChatSession): string {
  const count = session.messages.length;
  return `${count} message${count === 1 ? '' : 's'}`;
}

export function CopilotHeaderBar({
  mode,
  isModeMenuOpen,
  isHistoryOpen,
  isPending,
  sessions,
  activeSessionId,
  onSelectMode,
  onToggleModeMenu,
  onCloseMenus,
  onNewChat,
  onToggleHistory,
  onSelectSession,
}: CopilotHeaderBarProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const historySessions = sessions.filter(session => session.messages.length > 0);
  const activeLabel = MODE_OPTIONS.find(option => option.id === mode)?.label ?? 'Build';
  const menusOpen = isModeMenuOpen || isHistoryOpen;

  // Dismiss either popover on an outside click or Escape — matches the
  // lightweight dropdown behaviour the rest of the workspace uses.
  useEffect(() => {
    if (!menusOpen) {
      return;
    }
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        onCloseMenus();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onCloseMenus();
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menusOpen, onCloseMenus]);

  return (
    <div className="copilot-header" ref={containerRef}>
      <div className="copilot-header-bar">
        <div className="copilot-header-left">
          <div className="copilot-mode-dropdown">
            <button
              type="button"
              className="copilot-mode-trigger"
              aria-haspopup="menu"
              aria-expanded={isModeMenuOpen}
              disabled={isPending}
              title="Switch Co-producer mode"
              onClick={onToggleModeMenu}>
              <span>{activeLabel}</span>
              <ChevronDownIcon className="copilot-mode-caret" />
            </button>
            {isModeMenuOpen ? (
              <div className="copilot-mode-menu" role="menu" aria-label="Co-producer mode">
                {MODE_OPTIONS.map(option => (
                  <button
                    key={option.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={mode === option.id}
                    className={mode === option.id ? 'active' : ''}
                    title={option.hint}
                    onClick={() => onSelectMode(option.id)}>
                    <span>{option.label}</span>
                    {mode === option.id ? <CheckIcon className="copilot-mode-check" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <div className="copilot-header-actions">
          <button
            type="button"
            className="copilot-icon-button"
            aria-label="New Chat"
            title="New chat"
            disabled={isPending}
            onClick={onNewChat}>
            <PlusIcon className="copilot-icon" />
          </button>
          <button
            type="button"
            className="copilot-icon-button"
            aria-label="History"
            title="Chat history"
            aria-expanded={isHistoryOpen}
            disabled={historySessions.length === 0 || isPending}
            onClick={onToggleHistory}>
            <ClockHistoryIcon className="copilot-icon" />
          </button>
        </div>
      </div>
      {isHistoryOpen ? (
        <div className="copilot-history-list" role="listbox" aria-label="Co-producer chat history">
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
