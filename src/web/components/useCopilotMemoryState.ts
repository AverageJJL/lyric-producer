import {useCallback} from 'react';

import {
  copilotChatMessages,
  planCopilotMemoryForAsk,
} from '../../assistant/copilotMemory';
import {
  type CopilotChatSession,
  useCopilotChatHistoryStore,
} from '../../assistant/copilotChatHistory';
import type {CopilotContextPayload} from '../../assistant/copilotContext';
import type {CopilotBridge, CopilotUiState} from '../../native/copilotApi';

type PrepareMemoryInput = {
  message: string;
  session: CopilotChatSession;
  bridge: CopilotBridge;
  uiState: CopilotUiState;
  context: CopilotContextPayload;
  isCurrent: () => boolean;
};

export function useCopilotMemoryState() {
  const setSessionMemory = useCopilotChatHistoryStore(state => state.setSessionMemory);

  return useCallback(async ({
    message,
    session,
    bridge,
    uiState,
    context,
    isCurrent,
  }: PrepareMemoryInput) => {
    const chatMessages = copilotChatMessages(session.messages);
    const memoryPlan = planCopilotMemoryForAsk({
      message,
      history: chatMessages.slice(session.compactedMessageCount),
      conversationSummary: session.conversationSummary,
      uiState,
      context,
    });
    let requestSummary = session.conversationSummary;

    if (memoryPlan.shouldCompact && bridge.compact) {
      const compacted = await bridge.compact({
        history: memoryPlan.historyToCompact,
        conversationSummary: session.conversationSummary,
        currentUserMessage: message,
        uiState,
        context,
      });
      if (!isCurrent()) {
        return null;
      }
      if (compacted.ok) {
        requestSummary = compacted.summary;
        setSessionMemory(
          session.id,
          compacted.summary,
          session.compactedMessageCount + memoryPlan.historyToCompact.length,
        );
      }
    }

    return {history: memoryPlan.historyForRequest, conversationSummary: requestSummary};
  }, [setSessionMemory]);
}
