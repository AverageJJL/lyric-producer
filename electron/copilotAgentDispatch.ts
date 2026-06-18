/**
 * Per-turn tool-call dispatch for the agent loop, extracted from copilotAgentLoop.ts to
 * keep that file focused (and under the line budget) and to host the Ask-mode routing.
 *
 * Build mode: terminal tools (submit_project_patch / answer_copilot) end the turn;
 * list/read/grep feed results back. Ask mode: NO terminal tool is offered, so the model
 * navigates with the read-only nav + analysis tools and finishes with plain text; each
 * analysis tool also contributes an AskReport card collected here.
 */

import {AGENT_MAX_TOOL_CALLS, type ApcPatchTransaction} from './copilotAgentContract';
import {executeReadOnlyTool, type ApcAgentTree} from './copilotAgentTools';
import {
  parseArgs,
  patchFromArgs,
  rawAnswerFromArgs,
  validatePatchAgainstTree,
  type CopilotAgentAnswer,
} from './copilotAgentTurn';
import {runAskSessionTool} from './askAnalysisTools';
import {runAskAudioTool, type NativeCommandFn} from './askAudioTools';
import type {CopilotMode} from './askContract';
import type {AskReport} from './askReportTypes';

type ToolCall = {id?: string; function?: {name?: string; arguments?: unknown}};

export type DispatchContext = {
  tree: ApcAgentTree;
  mode: CopilotMode;
  sendNativeCommand?: NativeCommandFn;
  messages: Array<Record<string, unknown>>;
  seenToolCalls: Set<string>;
  reports: AskReport[];
  /** Mutable counters shared across the turn loop. */
  counters: {toolCallCount: number; sawReadProgress: boolean};
};

export type DispatchResult = {
  terminalPatch: ApcPatchTransaction | null;
  terminalAnswer: CopilotAgentAnswer | null;
  terminalText: string | null;
  budgetHit: boolean;
};

/** Run an Ask analysis tool (collecting its report) or fall back to list/read/grep. */
function runReadOnlyTool(ctx: DispatchContext, name: string, args: Record<string, unknown>): unknown {
  if (ctx.mode === 'ask') {
    const session = runAskSessionTool(ctx.tree, name, args);
    if (session) {
      if (session.report) {
        ctx.reports.push(session.report);
      }
      return session.result;
    }
    const audio = runAskAudioTool(ctx.tree, ctx.sendNativeCommand, name, args);
    if (audio) {
      if (audio.report) {
        ctx.reports.push(audio.report);
      }
      return audio.result;
    }
  }
  return executeReadOnlyTool(ctx.tree, name, args);
}

export function dispatchToolCalls(toolCalls: ToolCall[], ctx: DispatchContext): DispatchResult {
  let terminalPatch: ApcPatchTransaction | null = null;
  let terminalAnswer: CopilotAgentAnswer | null = null;
  let terminalText: string | null = null;
  let budgetHit = false;

  for (const call of toolCalls) {
    const name = call?.function?.name as string;
    const args = parseArgs(call?.function?.arguments);

    // In ask mode the mutating tools are not offered; if the model fabricates one, refuse.
    if (ctx.mode === 'ask' && (name === 'submit_project_patch' || name === 'answer_copilot')) {
      ctx.messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify({error: 'Ask mode is read-only. You cannot edit the project; answer in plain text.'}),
      });
      continue;
    }

    if (name === 'submit_project_patch') {
      const patch = patchFromArgs(args);
      const problems = validatePatchAgainstTree(ctx.tree, patch);
      if (problems.length === 0) {
        terminalPatch = patch;
      } else {
        ctx.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({error: 'patch rejected', problems}),
        });
      }
      continue;
    }

    if (name === 'answer_copilot') {
      const parsed = rawAnswerFromArgs(args);
      if (parsed.ok) {
        terminalAnswer = parsed.answer;
        terminalText = parsed.text;
      } else {
        ctx.messages.push({
          role: 'tool',
          tool_call_id: call.id,
          content: JSON.stringify({error: 'answer_copilot needs a non-empty text field.'}),
        });
      }
      continue;
    }

    // Read-only tool. Short-circuit duplicate calls to prevent thrash.
    ctx.counters.toolCallCount += 1;
    const signature = `${name}:${JSON.stringify(args)}`;
    const duplicate = ctx.seenToolCalls.has(signature);
    const result = duplicate
      ? {note: 'duplicate call — you already ran this; read different files or finish.'}
      : runReadOnlyTool(ctx, name, args);
    if (!duplicate) {
      ctx.counters.sawReadProgress = true;
    }
    ctx.seenToolCalls.add(signature);
    ctx.messages.push({role: 'tool', tool_call_id: call.id, content: JSON.stringify(result)});

    if (ctx.counters.toolCallCount >= AGENT_MAX_TOOL_CALLS) {
      ctx.messages.push({
        role: 'user',
        content: 'Tool-call budget reached. Finish now with answer_copilot, submit_project_patch, or plain text.',
      });
      budgetHit = true;
      break;
    }
  }

  return {terminalPatch, terminalAnswer, terminalText, budgetHit};
}
