import {
  AGENT_MAX_TURNS,
  COPILOT_AGENT_SYSTEM_PROMPT,
  COPILOT_AGENT_TOOLS,
  type ApcPatchTransaction,
} from './copilotAgentContract';
import {type ApcAgentTree} from './copilotAgentTools';
import {
  agentDebugEnabled,
  cleanString,
  contextMessage,
  type CopilotAgentAnswer,
  type CopilotAgentRequest,
} from './copilotAgentTurn';
import {dispatchToolCalls} from './copilotAgentDispatch';
import {ASK_AGENT_TOOLS, ASK_SYSTEM_PROMPT, type CopilotMode} from './askContract';
import type {NativeCommandFn} from './askAudioTools';
import type {AskReport} from './askReportTypes';

export type {CopilotAgentRequest, CopilotAgentAnswer} from './copilotAgentTurn';

/** Primary agentic model; env can override fallback for providers that need one. */
export const DEFAULT_AGENT_MODEL = 'google/gemini-3.1-pro-preview-customtools';
export const FALLBACK_AGENT_MODEL = 'google/gemini-3.1-pro-preview-customtools';

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT_MS = 45_000;
const RESPONSE_TOKEN_BUDGET = 4096;

type AgentOptions = {
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Synchronous native bridge for Ask measurement tools (main process supplies this). */
  sendNativeCommand?: NativeCommandFn;
};

export type CopilotAgentResult =
  | {
      ok: true;
      text: string;
      model: string;
      turns: number;
      patch?: ApcPatchTransaction | null;
      answer?: CopilotAgentAnswer;
      reports?: AskReport[];
    }
  | {ok: false; error: string};

type LoopOutcome =
  | {
      ok: true;
      text: string;
      turns: number;
      patch?: ApcPatchTransaction | null;
      answer?: CopilotAgentAnswer;
      reports?: AskReport[];
    }
  | {ok: false; error: string; fallback?: boolean};

type LoopContext = {
  url: string;
  apiKey: string;
  fetchImpl: typeof fetch;
  timeoutMs: number;
  debug: boolean;
  mode: CopilotMode;
  sendNativeCommand?: NativeCommandFn;
};

async function postChat(
  url: string,
  apiKey: string,
  body: unknown,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ok: true; json: any} | {ok: false; status: number}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const response = await fetchImpl(`${url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    signal: controller.signal,
    headers: {Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'AI Producer Core'},
    body: JSON.stringify(body),
  }).finally(() => clearTimeout(timeout));
  if (!response.ok) {
    return {ok: false, status: response.status};
  }
  return {ok: true, json: await response.json()};
}

async function runLoop(
  model: string,
  request: CopilotAgentRequest,
  message: string,
  tree: ApcAgentTree,
  ctx: LoopContext,
): Promise<LoopOutcome> {
  const ask = ctx.mode === 'ask';
  const messages: Array<Record<string, unknown>> = [
    {role: 'system', content: ask ? ASK_SYSTEM_PROMPT : COPILOT_AGENT_SYSTEM_PROMPT},
    // Heavy context + tree index sent ONCE; we append to `messages` each turn, never rebuild it.
    {role: 'user', content: contextMessage(request, message, tree)},
  ];
  const seenToolCalls = new Set<string>();
  const counters = {toolCallCount: 0, sawReadProgress: false};
  // Read-only Ask analysis tools each contribute a card; collected across turns and
  // returned with the answer (empty in Build mode).
  const reports: AskReport[] = [];

  for (let turn = 0; turn < AGENT_MAX_TURNS; turn += 1) {
    const body = {
      model,
      temperature: 0.2,
      max_tokens: RESPONSE_TOKEN_BUDGET,
      stream: false,
      messages,
      tools: ask ? ASK_AGENT_TOOLS : COPILOT_AGENT_TOOLS,
    };
    const turnStart = Date.now();
    const response = await postChat(ctx.url, ctx.apiKey, body, ctx.fetchImpl, ctx.timeoutMs);
    if (!response.ok) {
      // First-turn HTTP failure → let the caller try the fallback model.
      return {ok: false, error: `Agent model request failed (${response.status}).`, fallback: turn === 0};
    }
    const choice = response.json?.choices?.[0]?.message ?? {};
    const toolCalls: any[] = Array.isArray(choice.tool_calls) ? choice.tool_calls : [];
    if (ctx.debug) {
      const names = toolCalls.map(call => call?.function?.name).filter(Boolean).join(',') || (choice.content ? 'text' : 'empty');
      // Log a short slice of the model's reasoning/content so "why did it do X" is
      // answerable from the terminal without re-running.
      const rationale = typeof choice.reasoning === 'string' ? choice.reasoning : typeof choice.content === 'string' ? choice.content : '';
      const why = rationale ? ` :: ${rationale.replace(/\s+/g, ' ').trim().slice(0, 180)}` : '';
      // eslint-disable-next-line no-console
      console.error(`[copilot-agent:${ctx.mode}] ${model} turn ${turn + 1}: ${Date.now() - turnStart}ms → ${names}${why}`);
    }

    if (toolCalls.length === 0) {
      const text = cleanString(choice.content);
      if (text) {
        return {ok: true, text, patch: null, turns: turn + 1, reports};
      }
      // Empty turn-0 (no tools, no text) → the model is likely not tool-calling; fall
      // back to the proven model. Mid-loop blanks get one nudge before giving up.
      if (turn === 0) {
        return {ok: false, error: 'Agent returned no actionable response.', fallback: true};
      }
      if (turn < AGENT_MAX_TURNS - 1) {
        messages.push({
          role: 'user',
          content: ask
            ? 'You returned nothing usable. Reply with a short plain-text answer about the session.'
            : 'You returned nothing usable. Reply with a short plain-text answer, or call answer_copilot / submit_project_patch.',
        });
        continue;
      }
      return {ok: false, error: 'Agent returned no actionable response.'};
    }

    // Record the assistant tool-call message before appending tool results (OpenAI protocol).
    messages.push({role: 'assistant', content: choice.content ?? null, tool_calls: toolCalls});

    const dispatch = dispatchToolCalls(toolCalls, {
      tree,
      mode: ctx.mode,
      sendNativeCommand: ctx.sendNativeCommand,
      messages,
      seenToolCalls,
      reports,
      counters,
    });

    // A valid answer and/or patch makes the turn terminal. A valid answer wins the text
    // even if a co-emitted patch failed Stage-A (the bad patch is simply dropped).
    if (dispatch.terminalAnswer || dispatch.terminalPatch) {
      const text = dispatch.terminalText ?? dispatch.terminalPatch?.summary ?? '';
      return {
        ok: true,
        text,
        patch: dispatch.terminalPatch,
        answer: dispatch.terminalAnswer ?? undefined,
        turns: turn + 1,
        reports,
      };
    }
    // Otherwise we fed problems/read results back above → loop continues to self-correct.
  }
  // Out of turns. Fall back to the proven model only if the primary never even read a
  // file (truly stuck); if it was making progress, a fresh-start fallback won't help.
  return {ok: false, error: 'Agent did not finalize within the turn budget.', fallback: !counters.sawReadProgress};
}

export async function askCopilotAgent(
  request: CopilotAgentRequest,
  options: AgentOptions = {},
): Promise<CopilotAgentResult> {
  const env = options.env ?? process.env;
  const message = cleanString(request.message);
  if (!message || message.length > 2000) {
    return {ok: false, error: 'Copilot needs a shorter non-empty message.'};
  }
  const apiKey = cleanString(env.OPENROUTER_API_KEY);
  if (!apiKey) {
    return {ok: false, error: 'Missing OPENROUTER_API_KEY for Copilot.'};
  }
  const tree = request.tree;
  if (!tree || typeof tree.fingerprint !== 'string' || !Array.isArray(tree.index)) {
    return {ok: false, error: 'Copilot agent requires a project source tree.'};
  }

  const debug = agentDebugEnabled(env);
  const ctx: LoopContext = {
    url: cleanString(env.AI_PRODUCER_API_BASE_URL) ?? DEFAULT_BASE_URL,
    apiKey,
    fetchImpl: options.fetchImpl ?? globalThis.fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    debug,
    mode: request.mode === 'ask' ? 'ask' : 'build',
    sendNativeCommand: options.sendNativeCommand,
  };
  const primary = cleanString(env.AI_PRODUCER_AGENT_MODEL) ?? DEFAULT_AGENT_MODEL;
  const fallback = cleanString(env.AI_PRODUCER_FALLBACK_MODEL) ?? FALLBACK_AGENT_MODEL;
  const startedAt = Date.now();

  try {
    let outcome = await runLoop(primary, request, message, tree, ctx);
    let model = primary;
    if (!outcome.ok && outcome.fallback && primary !== fallback) {
      if (debug) {
        // eslint-disable-next-line no-console
        console.error(`[copilot-agent] primary ${primary} failed (${outcome.error}); falling back to ${fallback}`);
      }
      model = fallback;
      outcome = await runLoop(fallback, request, message, tree, ctx);
    }
    if (debug) {
      const kind = !outcome.ok ? `error: ${outcome.error}` : outcome.patch ? 'patch' : outcome.answer ? 'answer' : 'text';
      const turns = outcome.ok ? outcome.turns : '-';
      // eslint-disable-next-line no-console
      console.error(`[copilot-agent] done in ${Date.now() - startedAt}ms, model=${model}, turns=${turns}, result=${kind}`);
    }
    if (outcome.ok) {
      return {
        ok: true,
        text: outcome.text,
        patch: outcome.patch ?? null,
        answer: outcome.answer,
        reports: outcome.reports,
        model,
        turns: outcome.turns,
      };
    }
    return {ok: false, error: outcome.error};
  } catch (error) {
    const timedOut = error instanceof Error && error.name === 'AbortError';
    return {ok: false, error: timedOut ? 'Copilot agent timed out.' : 'Copilot agent could not reach the model.'};
  }
}
