export const DEFAULT_AGENT_MODEL = 'openai/gpt-4o-mini-search-preview';
export const DEFAULT_AGENT_FALLBACK_MODELS = [
  'openai/gpt-4o-mini',
  'openai/gpt-4.1-mini',
  'openai/gpt-4.1-nano',
] as const;
export const DEFAULT_COMPACTION_MODEL = 'openai/gpt-4o-mini';

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function csv(value: unknown): string[] {
  return cleanString(value)?.split(',').map(item => item.trim()).filter(Boolean) ?? [];
}

function unique(models: string[]): string[] {
  return [...new Set(models)];
}

export function agentModel(env: NodeJS.ProcessEnv = process.env): string {
  return cleanString(env.AI_PRODUCER_AGENT_MODEL) ?? DEFAULT_AGENT_MODEL;
}

export function fallbackAgentModels(env: NodeJS.ProcessEnv = process.env, primary = agentModel(env)): string[] {
  return unique([
    ...csv(env.AI_PRODUCER_FALLBACK_MODELS),
    ...(cleanString(env.AI_PRODUCER_FALLBACK_MODEL) ? [cleanString(env.AI_PRODUCER_FALLBACK_MODEL)!] : []),
    ...DEFAULT_AGENT_FALLBACK_MODELS,
  ]).filter(model => model !== primary);
}

export function compactionModel(env: NodeJS.ProcessEnv = process.env): string {
  return cleanString(env.AI_PRODUCER_MODEL) ?? DEFAULT_COMPACTION_MODEL;
}

export function copilotModelConfig(env: NodeJS.ProcessEnv = process.env) {
  const primary = agentModel(env);
  return {
    agentModel: primary,
    fallbackModel: fallbackAgentModels(env, primary).join(' | '),
    compactionModel: compactionModel(env),
  };
}
