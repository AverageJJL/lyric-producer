import {useCallback, useEffect, useRef, useState} from 'react';

import {type CopilotUiAction} from '../../assistant/copilotActions';
import {
  buildCopilotContextPayload,
  type CopilotContextPayload,
} from '../../assistant/copilotContext';
import {CopilotMessageArticle} from './CopilotMessageArticle';
import {CopilotHeaderBar} from './CopilotHeaderBar';
import {CopilotStagedProposalCard} from './CopilotStagedProposalCard';
import {runCopilotAgent, type RunCopilotAgentResult} from '../../assistant/runCopilotAgent';
import {revertStagedEdit} from '../../assistant/copilotStaging';
import {isCopilotStagePending, useCopilotStagingStore} from '../../assistant/copilotStagingStore';
import {
  useCopilotChatHistoryStore,
  type CopilotChatSession,
} from '../../assistant/copilotChatHistory';
import {CopilotInputForm} from './CopilotInputForm';
import {useCopilotProjectContext} from './useCopilotProjectContext';
import {useCopilotDrumPatternController} from './useCopilotDrumPatternController';
import {useCopilotEditableArrangement} from './useCopilotEditableArrangement';
import {useCopilotMidiOptionController} from './useCopilotMidiOptionController';
import {useCopilotMemoryState} from './useCopilotMemoryState';
import {getCopilotBridge, type CopilotMode, type CopilotUiState} from '../../native/copilotApi';

type CopilotPanelProps = {
  uiState: CopilotUiState;
  onActions: (actions: CopilotUiAction[], context: CopilotContextPayload) => void;
};

type AgentSuccess = Extract<RunCopilotAgentResult, {ok: true}>;

function messageId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function activeSessionFrom(sessions: CopilotChatSession[], activeSessionId: string): CopilotChatSession | undefined {
  return sessions.find(session => session.id === activeSessionId) ?? sessions[0];
}

export function CopilotPanel({uiState, onActions}: CopilotPanelProps) {
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<CopilotMode>('build');
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const activeRequestRef = useRef(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const bridge = getCopilotBridge();
  const projectContext = useCopilotProjectContext();
  const editableArrangement = useCopilotEditableArrangement();
  const sessions = useCopilotChatHistoryStore(state => state.sessions);
  const activeSessionId = useCopilotChatHistoryStore(state => state.activeSessionId);
  const pendingSessionId = useCopilotChatHistoryStore(state => state.pendingSessionId);
  const appendMessage = useCopilotChatHistoryStore(state => state.appendMessage);
  const newChat = useCopilotChatHistoryStore(state => state.newChat);
  const selectSession = useCopilotChatHistoryStore(state => state.selectSession);
  const setRequestPending = useCopilotChatHistoryStore(state => state.setRequestPending);
  const activeSession = activeSessionFrom(sessions, activeSessionId);
  const messages = activeSession?.messages ?? [];
  const isPending = pendingSessionId !== null;

  const focusInput = useCallback(() => { textareaRef.current?.focus({preventScroll: true}); }, []);

  const scheduleFocusInput = useCallback(() => {
    if (window.requestAnimationFrame) {
      const frame = window.requestAnimationFrame(focusInput);
      return () => window.cancelAnimationFrame(frame);
    }
    const timer = window.setTimeout(focusInput, 0);
    return () => window.clearTimeout(timer);
  }, [focusInput]);

  useEffect(() => scheduleFocusInput(), [scheduleFocusInput]);
  const midiOptions = useCopilotMidiOptionController(scheduleFocusInput);
  const drumPatterns = useCopilotDrumPatternController(scheduleFocusInput);
  const prepareMemoryRequest = useCopilotMemoryState();

  const closeMenus = useCallback(() => {
    setIsModeMenuOpen(false);
    setIsHistoryOpen(false);
  }, []);

  // Open one popover at a time so the mode menu and history list never overlap.
  const toggleModeMenu = useCallback(() => {
    setIsHistoryOpen(false);
    setIsModeMenuOpen(open => !open);
  }, []);

  const toggleHistory = useCallback(() => {
    setIsModeMenuOpen(false);
    setIsHistoryOpen(open => !open);
  }, []);

  const selectMode = useCallback((next: CopilotMode) => {
    setMode(next);
    setIsModeMenuOpen(false);
  }, []);

  const startNewChat = useCallback(() => {
    newChat();
    setDraft('');
    closeMenus();
    scheduleFocusInput();
  }, [closeMenus, newChat, scheduleFocusInput]);

  const selectHistorySession = useCallback((sessionId: string) => {
    selectSession(sessionId);
    setDraft('');
    closeMenus();
    scheduleFocusInput();
  }, [closeMenus, scheduleFocusInput, selectSession]);

  // Render the unified agent result: text bubble (+ any creative option cards),
  // dispatch UI-guidance actions (cursor highlighting), and set the single staged
  // proposal. Gated on the stale-request guard so a slow/superseded response never
  // appends a message, dispatches actions, or clobbers a fresher staged proposal.
  const appendAgentResult = (
    result: AgentSuccess,
    context: CopilotContextPayload,
    requestId: number,
    sessionId: string,
  ) => {
    if (activeRequestRef.current !== requestId) {
      return;
    }
    const note = result.proposal
      ? `${result.text}\n\nProposed an edit below — click “Stage & listen” to apply it in the workspace, then Accept or Reject.`
      : result.proposalError
        ? `${result.text}\n\n${result.proposalError}`
        : result.text;
    appendMessage(sessionId, {
      id: messageId('assistant'),
      role: 'assistant',
      content: note,
      model: result.model,
      midiOptions: result.midiOptions,
      drumPatternOptions: result.drumPatternOptions,
      askReports: result.reports.length > 0 ? result.reports : undefined,
    });
    onActions(result.actions, context);
    if (result.proposal) {
      // Never orphan a still-undecided preview: revert any live-but-unaccepted stage
      // back to its base before the new proposal replaces the card.
      if (isCopilotStagePending()) {
        revertStagedEdit();
      }
      useCopilotStagingStore.getState().setStagedProposal(result.proposal);
    }
  };

  const appendError = (error: string, requestId: number, sessionId: string) => {
    if (activeRequestRef.current !== requestId) {
      return;
    }
    appendMessage(sessionId, {id: messageId('error'), role: 'assistant', content: error, error: true});
  };

  const sendMessage = async (overrideMessage?: string) => {
    if (!activeSession) return;
    const sessionId = activeSession.id;
    const message = (overrideMessage ?? draft).trim();
    if (!message || isPending) return;
    setDraft('');
    setRequestPending(sessionId);
    const requestId = activeRequestRef.current + 1;
    activeRequestRef.current = requestId;
    appendMessage(sessionId, {id: messageId('user'), role: 'user', content: message});
    focusInput();
    scheduleFocusInput();
    const context = buildCopilotContextPayload(uiState, editableArrangement, projectContext);

    if (!bridge) {
      appendError('Copilot is not available in this renderer.', requestId, sessionId);
      setRequestPending(null);
      return;
    }

    try {
      const memory = await prepareMemoryRequest({
        message,
        session: activeSession,
        bridge,
        uiState,
        context,
        isCurrent: () => activeRequestRef.current === requestId,
      });
      if (!memory) {
        if (activeRequestRef.current === requestId) {
          setRequestPending(null);
        }
        return;
      }
      const agentResult = await runCopilotAgent({
        message,
        history: memory.history,
        conversationSummary: memory.conversationSummary,
        context,
        mode,
      });
      if (activeRequestRef.current !== requestId) {
        return;
      }
      setRequestPending(null);
      if (!agentResult.ok) {
        appendError(agentResult.error, requestId, sessionId);
        return;
      }
      appendAgentResult(agentResult, context, requestId, sessionId);
    } catch {
      if (activeRequestRef.current === requestId) {
        setRequestPending(null);
      }
      appendError('Copilot request failed before a response was returned.', requestId, sessionId);
    }
  };

  return (
    <section
      className="copilot-panel"
      aria-label="Copilot chat"
      data-copilot-mode={mode}>
      <CopilotHeaderBar
        mode={mode}
        isModeMenuOpen={isModeMenuOpen}
        isHistoryOpen={isHistoryOpen}
        isPending={isPending}
        sessions={sessions}
        activeSessionId={activeSessionId}
        onSelectMode={selectMode}
        onToggleModeMenu={toggleModeMenu}
        onCloseMenus={closeMenus}
        onNewChat={startNewChat}
        onToggleHistory={toggleHistory}
        onSelectSession={selectHistorySession}
      />
      <div className="copilot-thread" aria-live="polite">
        {messages.map(message => (
          <CopilotMessageArticle
            key={message.id}
            message={message}
            midiOptions={midiOptions}
            drumPatterns={drumPatterns}
          />
        ))}
        {isPending ? (
          <article className="copilot-message assistant pending">
            <span className="copilot-message-role">Copilot</span>
            <p className="copilot-message-plain">Thinking...</p>
          </article>
        ) : null}
        <CopilotStagedProposalCard />
      </div>
      <CopilotInputForm
        draft={draft}
        isPending={isPending}
        textareaRef={textareaRef}
        onDraftChange={setDraft}
        onSend={() => void sendMessage()}
      />
    </section>
  );
}
