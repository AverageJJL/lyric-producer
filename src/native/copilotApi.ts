import type {CopilotAnswer} from '../assistant/copilotActions';
import type {CopilotContextPayload} from '../assistant/copilotContext';

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

export type CopilotAskRequest = {
  message: string;
  history: CopilotChatMessage[];
  uiState: CopilotUiState;
  context: CopilotContextPayload;
};

export type CopilotAskResponse =
  | {ok: true; answer: CopilotAnswer; model: string}
  | {ok: false; error: string};

export type CopilotBridge = {
  ask: (request: CopilotAskRequest) => Promise<CopilotAskResponse>;
};

declare global {
  interface Window {
    copilot?: CopilotBridge;
  }
}

export function getCopilotBridge(): CopilotBridge | null {
  return globalThis.window?.copilot ?? null;
}
