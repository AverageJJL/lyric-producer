import {
  COPILOT_CONTEXT_MESSAGE_CHAR_LIMIT,
  COPILOT_SUMMARY_TARGET_TOKENS,
  DEFAULT_MODEL,
} from './copilotRequest';

type CopilotCompactIpcRequest = {
  history?: unknown;
  conversationSummary?: unknown;
  currentUserMessage?: unknown;
  uiState?: unknown;
  context?: unknown;
};

type OpenRouterOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 30_000;

const COMPACTION_SYSTEM_PROMPT = [
  'You compact AI Producer Core Copilot chat history for future turns.',
  'Summarize durable context only: user goals, musical preferences, arrangement actions proposed or applied, unresolved questions, constraints, and important decisions.',
  'Do not invent project state, instruments, tracks, or pending edits.',
  'Ignore transient greetings, repeated acknowledgements, and stale UI details unless they affect the current task.',
  'Return concise plain Markdown with sections: User Goals, Durable Project Context, Decisions, Pending Items, Constraints.',
].join(' ');

function cleanString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function trimmedJson(value: unknown): string {
  return JSON.stringify(value, null, 0).slice(0, COPILOT_CONTEXT_MESSAGE_CHAR_LIMIT);
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = await response.json() as {error?: {message?: string}; message?: string};
    return body.error?.message ?? body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

function responseSummary(json: unknown): string | null {
  const choices = (json as {choices?: Array<{message?: {content?: unknown}}>})?.choices;
  const content = choices?.[0]?.message?.content;
  return cleanString(content) ?? null;
}

export function copilotCompactionRequestBody(request: CopilotCompactIpcRequest, model: string) {
  const payload = {
    existingSummary: cleanString(request.conversationSummary),
    messagesToCompact: asArray(request.history),
    currentUserMessage: cleanString(request.currentUserMessage),
    currentUiState: request.uiState ?? {},
    currentCopilotContext: request.context ?? {},
  };

  return {
    model,
    temperature: 0.1,
    max_tokens: COPILOT_SUMMARY_TARGET_TOKENS,
    stream: false,
    messages: [
      {role: 'system', content: COMPACTION_SYSTEM_PROMPT},
      {role: 'user', content: trimmedJson(payload)},
    ],
  };
}

export async function askOpenRouterCopilotCompaction(
  request: CopilotCompactIpcRequest,
  options: OpenRouterOptions = {},
) {
  if (asArray(request.history).length === 0 && !cleanString(request.conversationSummary)) {
    return {ok: false as const, error: 'No Copilot history is available to compact.'};
  }

  const env = options.env ?? process.env;
  const apiKey = cleanString(env.OPENROUTER_API_KEY);
  if (!apiKey) {
    return {ok: false as const, error: 'Missing OPENROUTER_API_KEY for Copilot.'};
  }

  const model = cleanString(env.AI_PRODUCER_MODEL) ?? DEFAULT_MODEL;
  const baseUrl = cleanString(env.AI_PRODUCER_API_BASE_URL) ?? DEFAULT_BASE_URL;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'AI Producer Core'},
      body: JSON.stringify(copilotCompactionRequestBody(request, model)),
    }).finally(() => clearTimeout(timeout));

    if (!response.ok) {
      return {
        ok: false as const,
        error: `OpenRouter compaction failed (${response.status}): ${await errorText(response)}`,
      };
    }

    const summary = responseSummary(await response.json());
    return summary
      ? {ok: true as const, summary}
      : {ok: false as const, error: 'OpenRouter returned an empty Copilot compaction summary.'};
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {ok: false as const, error: timedOut ? 'Copilot compaction timed out.' : 'Copilot could not reach OpenRouter.'};
  }
}
