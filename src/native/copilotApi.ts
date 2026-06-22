import type {CopilotContextPayload} from '../assistant/copilotContext';
import type {ApcVirtualTree} from '../assistant/apcSourceTree';
import type {ApcPatchTransaction} from '../assistant/copilotPatchApply';
import type {AskReport} from '../assistant/askReports';

/** Which Copilot persona/toolset to run: editing 'build' or read-only 'ask'. */
export type CopilotMode = 'build' | 'ask';

export type CopilotChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  model?: string;
};

export type CopilotUiState = {
  rightPanel: string | null;
  isMixerOpen: boolean;
  selectedTrackId?: string | null;
  selectedTrackName?: string;
  selectedBlockName?: string;
  trackCount: number;
  hasSelectedBlock: boolean;
  bpm: number;
  isPlaying: boolean;
  isRecording: boolean;
  visibleTrackNames: string[];
};

export type CopilotCompactRequest = {
  history: CopilotChatMessage[];
  conversationSummary?: string;
  currentUserMessage?: string;
  uiState?: CopilotUiState;
  context?: CopilotContextPayload;
};

export type CopilotCompactResponse =
  | {ok: true; summary: string}
  | {ok: false; error: string};

export type CopilotModelConfig = {
  agentModel: string;
  fallbackModel: string;
  compactionModel: string;
};

export type CopilotDemoUsage = {
  enabled: boolean;
  limit: number;
  used: number;
  remaining: number;
};

export type CopilotAgentAskRequest = {
  message: string;
  history?: CopilotChatMessage[];
  conversationSummary?: string;
  context?: CopilotContextPayload;
  tree: ApcVirtualTree;
  /** 'ask' runs the read-only Session Companion; omit/'build' keeps the editing Copilot. */
  mode?: CopilotMode;
};

/**
 * The RAW `answer_copilot` payload the agent loop forwards alongside any patch. The
 * renderer always re-sanitizes this against the live store + DOM (sanitizeCopilotAnswer),
 * so it is intentionally untrusted/loose here — never consume it without sanitizing.
 */
export type CopilotAgentAnswerPayload = {
  text?: string;
  actions?: unknown;
  midiBlockEdits?: unknown;
  midiOptions?: unknown;
  drumPatternOptions?: unknown;
  drumPatternEdits?: unknown;
};

export type CopilotAgentAskResponse =
  | {
      ok: true;
      text: string;
      patch: ApcPatchTransaction | null;
      answer?: CopilotAgentAnswerPayload | null;
      reports?: AskReport[];
      model: string;
      turns: number;
    }
  | {ok: false; error: string};

export type CopilotBridge = {
  agentAsk: (request: CopilotAgentAskRequest) => Promise<CopilotAgentAskResponse>;
  compact?: (request: CopilotCompactRequest) => Promise<CopilotCompactResponse>;
  modelConfig?: () => Promise<CopilotModelConfig>;
  demoUsage?: () => Promise<CopilotDemoUsage>;
};

declare global {
  interface Window {
    copilot?: CopilotBridge;
  }
}

export function getCopilotBridge(): CopilotBridge | null {
  return globalThis.window?.copilot ?? null;
}
