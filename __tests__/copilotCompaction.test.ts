import {
  askOpenRouterCopilotCompaction,
  copilotCompactionRequestBody,
} from '../electron/copilotCompaction';
import {COPILOT_SUMMARY_TARGET_TOKENS} from '../electron/copilotRequest';

function response(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Bad Request',
    json: async () => body,
  } as Response;
}

describe('copilot compaction IPC helper', () => {
  it('builds a no-tools summarization request', () => {
    const body = copilotCompactionRequestBody({
      conversationSummary: 'Existing durable memory.',
      history: [{role: 'user', content: 'Make a piano idea.'}],
      currentUserMessage: 'Continue this.',
      uiState: {rightPanel: 'copilot'},
      context: {project: {bpm: 120}},
    }, 'openai/gpt-4o-mini');

    expect(body.model).toBe('openai/gpt-4o-mini');
    expect(body.max_tokens).toBe(COPILOT_SUMMARY_TARGET_TOKENS);
    expect(body.stream).toBe(false);
    expect(body).not.toHaveProperty('tools');
    expect(body.messages[0].content).toContain('compact AI Producer Core Copilot chat history');
    expect(body.messages[1].content).toContain('Existing durable memory');
    expect(body.messages[1].content).toContain('Make a piano idea');
  });

  it('uses the current model configuration and returns the summary text', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      choices: [{message: {content: '## User Goals\nCreate MIDI sketches.'}}],
    }));

    await expect(askOpenRouterCopilotCompaction({
      history: [{role: 'user', content: 'Create a piano track.'}],
    }, {
      env: {OPENROUTER_API_KEY: 'sk-test', AI_PRODUCER_MODEL: 'openai/gpt-4o-mini'},
      fetchImpl,
    })).resolves.toEqual({ok: true, summary: '## User Goals\nCreate MIDI sketches.'});

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body).tools).toBeUndefined();
  });

  it('reports compaction transport failures without mutating renderer state', async () => {
    await expect(askOpenRouterCopilotCompaction({
      history: [{role: 'user', content: 'Create a piano track.'}],
    }, {
      env: {OPENROUTER_API_KEY: 'sk-test'},
      fetchImpl: jest.fn().mockResolvedValue(response({error: {message: 'Nope'}}, false, 429)),
    })).resolves.toEqual({
      ok: false,
      error: 'OpenRouter compaction failed (429): Nope',
    });
  });
});
