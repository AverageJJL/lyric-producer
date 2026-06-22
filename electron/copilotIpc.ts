import {ipcMain} from 'electron';
import {askCopilotAgent} from './copilotAgentLoop';
import {askOpenRouterCopilotCompaction} from './copilotCompaction';
import {copilotModelConfig} from './copilotModels';
import type {NativeCommandFn} from './askAudioTools';
import {
  copilotEnvForPublicDemo,
  readPublicDemoConfig,
  type PublicDemoConfig,
} from './publicDemoConfig';
import {
  consumePublicDemoCopilotMessage,
  publicDemoUsageStatus,
} from './publicDemoUsage';

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
  demoConfig?: () => PublicDemoConfig;
  demoUsagePath?: () => string;
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
  const config = () => deps.demoConfig?.() ?? readPublicDemoConfig(undefined, process.env);
  ipcMain.handle('copilot:agent-ask', async (_event, request?: Parameters<typeof askCopilotAgent>[0]) => {
    const demo = config();
    if (demo.enabled && !demo.openRouterProxyBaseUrl) {
      return {ok: false as const, error: 'Public demo proxy is not configured.'};
    }
    const usage = consumePublicDemoCopilotMessage(demo, deps.demoUsagePath?.());
    if (!usage.ok) {
      return {ok: false as const, error: usage.error};
    }
    return askCopilotAgent(request ?? {}, {
      env: copilotEnvForPublicDemo(process.env, demo),
      sendNativeCommand: deps.sendNativeCommand,
    });
  });
  ipcMain.handle('copilot:compact', async (_event, request?: CopilotCompactIpcRequest) => {
    const demo = config();
    return demo.enabled
      ? {ok: false as const, error: 'Public demo skips hidden Copilot compaction calls.'}
      : askOpenRouterCopilotCompaction(request ?? {});
  });
  ipcMain.handle('copilot:model-config', async () =>
    copilotModelConfig(copilotEnvForPublicDemo(process.env, config())),
  );
  ipcMain.handle('copilot:demo-usage', async () =>
    publicDemoUsageStatus(config(), deps.demoUsagePath?.()),
  );
}
