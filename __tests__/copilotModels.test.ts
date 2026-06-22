import {
  DEFAULT_AGENT_MODEL,
  agentModel,
  compactionModel,
  copilotModelConfig,
  fallbackAgentModels,
} from '../electron/copilotModels';

describe('copilot model defaults', () => {
  it('defaults Copilot to the OpenAI search-preview model with cheap OpenAI fallbacks', () => {
    const env = {} as NodeJS.ProcessEnv;
    expect(agentModel(env)).toBe('openai/gpt-4o-mini-search-preview');
    expect(agentModel(env)).toBe(DEFAULT_AGENT_MODEL);
    expect(fallbackAgentModels(env)).toEqual([
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-mini',
      'openai/gpt-4.1-nano',
    ]);
    expect(compactionModel(env)).toBe('openai/gpt-4o-mini');
  });

  it('keeps env fallback overrides ahead of the default fallback chain', () => {
    const env = {
      AI_PRODUCER_AGENT_MODEL: 'custom/primary',
      AI_PRODUCER_FALLBACK_MODELS: 'custom/a, custom/b',
      AI_PRODUCER_FALLBACK_MODEL: 'custom/c',
      AI_PRODUCER_MODEL: 'custom/memory',
    } as NodeJS.ProcessEnv;
    expect(fallbackAgentModels(env)).toEqual([
      'custom/a',
      'custom/b',
      'custom/c',
      'openai/gpt-4o-mini',
      'openai/gpt-4.1-mini',
      'openai/gpt-4.1-nano',
    ]);
    expect(copilotModelConfig(env)).toMatchObject({
      agentModel: 'custom/primary',
      compactionModel: 'custom/memory',
    });
  });
});
