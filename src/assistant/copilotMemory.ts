export type CopilotMemoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type CopilotMemoryPlanInput = {
  message: string;
  history: CopilotMemoryMessage[];
  conversationSummary?: string;
  uiState: unknown;
  context: unknown;
};

export type CopilotMemoryPlan = {
  shouldCompact: boolean;
  promptTokens: number;
  historyForRequest: CopilotMemoryMessage[];
  historyToCompact: CopilotMemoryMessage[];
};

export const MIMO_CONTEXT_WINDOW_TOKENS = 1_048_576;
export const COPILOT_COMPACTION_TRIGGER_TOKENS = 100_000;
export const COPILOT_RECENT_MESSAGE_TAIL = 12;
export const COPILOT_RESPONSE_TOKEN_BUDGET = 4096;
export const COPILOT_SUMMARY_TARGET_TOKENS = 4000;

const COPILOT_STATIC_PROMPT_OVERHEAD_TOKENS = 6000;
const TOKEN_ESTIMATE_CHARS_PER_TOKEN = 3;

function cleanSummary(value: string | undefined): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

export function estimateCopilotTokens(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil((text?.length ?? 0) / TOKEN_ESTIMATE_CHARS_PER_TOKEN);
}

export function copilotChatMessages<T extends {role: string; content: string; error?: boolean}>(
  messages: T[],
): CopilotMemoryMessage[] {
  return messages
    .filter(message => !message.error && (message.role === 'user' || message.role === 'assistant'))
    .map(message => ({role: message.role as 'user' | 'assistant', content: message.content}));
}

export function estimateCopilotAskPromptTokens(input: CopilotMemoryPlanInput): number {
  return COPILOT_STATIC_PROMPT_OVERHEAD_TOKENS + estimateCopilotTokens({
    currentUserMessage: input.message,
    conversationSummary: cleanSummary(input.conversationSummary),
    recentChat: input.history,
    copilotContext: input.context,
    uiState: input.uiState,
    responseBudget: COPILOT_RESPONSE_TOKEN_BUDGET,
  });
}

function compactedRequestFits(input: CopilotMemoryPlanInput, recentCount: number): boolean {
  const recent = input.history.slice(-recentCount);
  return estimateCopilotAskPromptTokens({...input, history: recent}) < COPILOT_COMPACTION_TRIGGER_TOKENS;
}

export function planCopilotMemoryForAsk(input: CopilotMemoryPlanInput): CopilotMemoryPlan {
  const history = copilotChatMessages(input.history);
  const normalized = {...input, conversationSummary: cleanSummary(input.conversationSummary), history};
  const promptTokens = estimateCopilotAskPromptTokens(normalized);

  if (promptTokens < COPILOT_COMPACTION_TRIGGER_TOKENS) {
    return {shouldCompact: false, promptTokens, historyForRequest: history, historyToCompact: []};
  }

  let recentCount = Math.min(COPILOT_RECENT_MESSAGE_TAIL, history.length);
  while (recentCount > 0 && !compactedRequestFits(normalized, recentCount)) {
    recentCount -= 1;
  }

  const splitIndex = Math.max(0, history.length - recentCount);
  return {
    shouldCompact: splitIndex > 0,
    promptTokens,
    historyForRequest: history.slice(splitIndex),
    historyToCompact: history.slice(0, splitIndex),
  };
}
