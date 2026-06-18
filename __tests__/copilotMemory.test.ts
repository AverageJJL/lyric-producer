import {
  COPILOT_RECENT_MESSAGE_TAIL,
  estimateCopilotAskPromptTokens,
  planCopilotMemoryForAsk,
  type CopilotMemoryMessage,
} from '../src/assistant/copilotMemory';

function message(index: number, content = 'short'): CopilotMemoryMessage {
  return {role: index % 2 === 0 ? 'user' : 'assistant', content: `${content}-${index}`};
}

describe('copilot memory planning', () => {
  it('keeps full history while the prompt is below the compaction threshold', () => {
    const history = Array.from({length: 14}, (_, index) => message(index));
    const plan = planCopilotMemoryForAsk({
      message: 'What did we decide earlier?',
      history,
      uiState: {rightPanel: 'copilot'},
      context: {project: {bpm: 120}},
    });

    expect(plan.shouldCompact).toBe(false);
    expect(plan.historyForRequest).toEqual(history);
    expect(plan.historyForRequest).toHaveLength(14);
    expect(plan.historyToCompact).toHaveLength(0);
  });

  it('compacts older history and preserves the recent tail over the threshold', () => {
    const longTurn = 'x'.repeat(20_000);
    const history = Array.from({length: 20}, (_, index) => message(index, longTurn));
    const plan = planCopilotMemoryForAsk({
      message: 'Keep going from here.',
      history,
      conversationSummary: 'Previous summary.',
      uiState: {rightPanel: 'copilot'},
      context: {project: {bpm: 120}},
    });

    expect(plan.shouldCompact).toBe(true);
    expect(plan.historyForRequest).toHaveLength(COPILOT_RECENT_MESSAGE_TAIL);
    expect(plan.historyToCompact).toHaveLength(8);
    expect(plan.historyForRequest[0]).toEqual(history[8]);
  });

  it('uses a conservative token estimate for ask payloads', () => {
    const tokens = estimateCopilotAskPromptTokens({
      message: 'hello',
      history: [message(0, 'abc')],
      uiState: {},
      context: {},
    });

    expect(tokens).toBeGreaterThan(6000);
  });
});
