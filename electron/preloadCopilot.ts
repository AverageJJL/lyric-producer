import {contextBridge, ipcRenderer} from 'electron';

export function exposeCopilotBridge(): void {
  contextBridge.exposeInMainWorld('copilot', {
    agentAsk(request: {
      message: string;
      history?: Array<{role: 'user' | 'assistant'; content: string}>;
      conversationSummary?: string;
      context?: Record<string, unknown>;
      mode?: 'build' | 'ask';
      tree?: {
        fingerprint: string;
        files: Record<string, string>;
        index: Array<{path: string; bytes: number; contentHash: string}>;
      };
    }) {
      return ipcRenderer.invoke('copilot:agent-ask', request);
    },

    compact(request: {
      history: Array<{role: 'user' | 'assistant'; content: string}>;
      conversationSummary?: string;
      currentUserMessage?: string;
      uiState?: Record<string, unknown>;
      context?: Record<string, unknown>;
    }) {
      return ipcRenderer.invoke('copilot:compact', request);
    },

    modelConfig() {
      return ipcRenderer.invoke('copilot:model-config');
    },

    demoUsage() {
      return ipcRenderer.invoke('copilot:demo-usage');
    },
  });
}
