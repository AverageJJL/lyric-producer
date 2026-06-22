import {ipcMain} from 'electron';
import {askCopilotAgent} from './copilotAgentLoop';
import {askOpenRouterCopilotCompaction} from './copilotCompaction';
import {copilotModelConfig} from './copilotModels';
import type {NativeCommandFn} from './askAudioTools';

type CopilotCompactIpcRequest = {
  history?: unknown;
  conversationSummary?: unknown;
  currentUserMessage?: unknown;
  uiState?: unknown;
  context?: unknown;
};

type CopilotIpcDeps = {
  /** Synchronous native bridge used by read-only Ask measurement tools. */
  sendNativeCommand?: NativeCommandFn;
};

/**
 * The Copilot has ONE request path: the agentic tool-loop (`copilot:agent-ask`).
 * The classic single-shot `copilot:ask` route was removed — every user message now
 * goes through the loop, which answers with plain text, UI guidance + option
 * previews (answer_copilot), and/or staged `.apc` edits (submit_project_patch). In
 * read-only Ask mode (request.mode === 'ask') the same loop runs measurement tools that
 * reach the C++ engine via `sendNativeCommand`. `copilot:compact` remains for
 * conversation-memory summarization.
 */
export function registerCopilotIpc(deps: CopilotIpcDeps = {}): void {
  ipcMain.handle('copilot:agent-ask', async (_event, request?: Parameters<typeof askCopilotAgent>[0]) =>
    askCopilotAgent(request ?? {}, {sendNativeCommand: deps.sendNativeCommand}),
  );
  ipcMain.handle('copilot:compact', async (_event, request?: CopilotCompactIpcRequest) =>
    askOpenRouterCopilotCompaction(request ?? {}),
  );
  ipcMain.handle('copilot:model-config', async () => copilotModelConfig());
}
