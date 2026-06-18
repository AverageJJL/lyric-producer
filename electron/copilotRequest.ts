/**
 * Shared Copilot constants. After unification the one Copilot path is the agent
 * tool-loop (`copilotAgentLoop.ts`); this module keeps Electron-side model and
 * token-budget values.
 *
 * NOTE: the renderer keeps its own copies of these token budgets in
 * `src/assistant/copilotMemory.ts` (it cannot import from electron/), so changing
 * a value here must be mirrored there.
 */
export {copilotToolSchema} from './copilotContract';

export const DEFAULT_MODEL = 'google/gemini-3.1-pro-preview-customtools';
export const MIMO_CONTEXT_WINDOW_TOKENS = 1_048_576;
export const COPILOT_COMPACTION_TRIGGER_TOKENS = 100_000;
export const COPILOT_RESPONSE_TOKEN_BUDGET = 4096;
export const COPILOT_SUMMARY_TARGET_TOKENS = 4000;
export const COPILOT_CONTEXT_MESSAGE_CHAR_LIMIT = 480_000;
