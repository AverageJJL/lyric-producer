import {captureProjectSnapshot} from '../arrangement/projectSnapshot';
import {useDAWStore} from '../store/useDAWStore';
import {buildApcVirtualTree} from './apcSourceTree';
import {sanitizeCopilotAnswer, type CopilotAnswer, type CopilotUiAction} from './copilotActions';
import {
  copilotRevealTargetIds,
  copilotVisibleTargetIds,
  type CopilotContextPayload,
} from './copilotContext';
import {
  copilotMidiBlockEditsToOperations,
  describeCopilotMidiBlockEdit,
} from './copilotMidiBlockEdits';
import {
  copilotDrumPatternEditsToOperations,
  describeCopilotDrumPatternEdit,
  type CopilotDrumPatternOption,
} from './copilotDrumPatternOptions';
import type {CopilotMidiOption} from './copilotMidiOptions';
import type {ApcPatchTransaction} from './copilotPatchApply';
import {stagedProposalFromPatch} from './copilotProposedEdits';
import {stagedEditFromOperations, type StagedProposal} from './copilotStagedEdit';
import {
  getCopilotBridge,
  type CopilotChatMessage,
  type CopilotMode,
} from '../native/copilotApi';
import {sanitizeAskReports, type AskReport} from './askReports';

let proposalCounter = 0;

/**
 * Result of one unified Copilot turn. A turn can produce any combination of:
 * plain text, UI-guidance `actions` (cursor highlighting), non-mutating creative
 * `midiOptions`/`drumPatternOptions` preview cards, and at most ONE staged `proposal`
 * (a Cursor-style preview the user accepts/rejects). The panel renders all of these.
 */
export type RunCopilotAgentResult =
  | {
      ok: true;
      text: string;
      model: string;
      actions: CopilotUiAction[];
      midiOptions: CopilotMidiOption[];
      drumPatternOptions: CopilotDrumPatternOption[];
      proposal: StagedProposal | null;
      proposalError?: string;
      reports: AskReport[];
    }
  | {ok: false; error: string};

/**
 * Staging-multiplexing rule. The staging store holds ONE proposal whose edits are
 * swappable alternatives, so a snapshot-kind edit (from a patch) and an
 * operations-kind edit (from structured ops) must never coexist — they encode
 * different bases and won't compose. Precedence:
 *   1. A patch is the authoritative whole-tree edit → use it; drop co-emitted
 *      structured edits (redundant/conflicting).
 *   2. Else combine midiBlockEdits + drumPatternEdits into ONE operations edit.
 *      A conversion failure (locked track / bad notes) yields no proposal + an error
 *      rather than a partial stage.
 */
function buildProposal(
  answer: CopilotAnswer,
  patch: ApcPatchTransaction | null,
): {proposal: StagedProposal | null; error?: string} {
  if (patch) {
    const proposalId = `copilot-proposal-${(proposalCounter += 1)}`;
    const result = stagedProposalFromPatch(proposalId, patch);
    return result.ok ? {proposal: result.proposal} : {proposal: null, error: result.error};
  }

  if (answer.midiBlockEdits.length === 0 && answer.drumPatternEdits.length === 0) {
    return {proposal: null};
  }

  const state = useDAWStore.getState();
  const midi = answer.midiBlockEdits.length
    ? copilotMidiBlockEditsToOperations(answer.midiBlockEdits, state)
    : ({ok: true, operations: [], message: ''} as const);
  if (!midi.ok) {
    return {proposal: null, error: midi.error};
  }
  const drum = answer.drumPatternEdits.length
    ? copilotDrumPatternEditsToOperations(answer.drumPatternEdits, state)
    : ({ok: true, operations: [], message: ''} as const);
  if (!drum.ok) {
    return {proposal: null, error: drum.error};
  }

  const operations = [...midi.operations, ...drum.operations];
  if (operations.length === 0) {
    return {proposal: null};
  }
  const proposalId = `copilot-proposal-${(proposalCounter += 1)}`;
  const summary = [
    ...answer.midiBlockEdits.map(describeCopilotMidiBlockEdit),
    ...answer.drumPatternEdits.map(describeCopilotDrumPatternEdit),
  ];
  const edit = stagedEditFromOperations(
    {id: `${proposalId}-edit`, proposalId, label: 'AI edit', summary},
    operations,
  );
  return {proposal: {proposalId, title: 'AI edit', edits: [edit]}};
}

/**
 * Drive one unified Copilot turn (renderer side):
 *  1. snapshot the live project into the sanitized virtual tree,
 *  2. send it + the request to the agent loop (main process),
 *  3. sanitize the raw answer against the LIVE context (target IDs, catalog), and
 *  4. return text + actions + option cards + a single staged proposal for the panel.
 *
 * This does NOT write the staging store — it returns the proposal so the panel can
 * gate the side effect on its stale-request guard. Building the proposal is pure
 * (reads state, compiles a snapshot copy) so a dropped stale response leaves no residue.
 */
export async function runCopilotAgent(input: {
  message: string;
  history?: CopilotChatMessage[];
  conversationSummary?: string;
  context: CopilotContextPayload;
  mode?: CopilotMode;
}): Promise<RunCopilotAgentResult> {
  const bridge = getCopilotBridge();
  if (!bridge?.agentAsk) {
    return {ok: false, error: 'Copilot agent is unavailable.'};
  }

  const mode = input.mode ?? 'build';
  const tree = buildApcVirtualTree(captureProjectSnapshot());
  const response = await bridge.agentAsk({
    message: input.message,
    history: input.history,
    conversationSummary: input.conversationSummary,
    context: input.context,
    mode,
    tree,
  });
  if (!response.ok) {
    return {ok: false, error: response.error};
  }

  const reports = sanitizeAskReports(response.reports);

  // Ask mode is read-only: never build or stage a project edit, even if the model somehow
  // returned one. Surface the answer text + measurement report cards only.
  if (mode === 'ask') {
    return {
      ok: true,
      text: response.text,
      model: response.model,
      actions: [],
      midiOptions: [],
      drumPatternOptions: [],
      proposal: null,
      reports,
    };
  }

  // The model's structured payload is untrusted: re-validate against the live DOM
  // target IDs + catalog. The agent's `answer` payload carries the structured arrays
  // but NOT the reply text (text rides `response.text` separately) — so merge it back
  // in, or sanitizeCopilotAnswer sees empty text and shows its placeholder instead of
  // the model's actual words. When only text/patch came back, `answer` is absent and
  // options/actions default to empty.
  const sanitized = sanitizeCopilotAnswer({...response.answer, text: response.text}, {
    visibleTargetIds: copilotVisibleTargetIds(input.context),
    revealTargetIds: copilotRevealTargetIds(input.context),
  });

  const built = buildProposal(sanitized, response.patch ?? null);
  return {
    ok: true,
    text: sanitized.text,
    model: response.model,
    actions: sanitized.actions,
    midiOptions: sanitized.midiOptions,
    drumPatternOptions: sanitized.drumPatternOptions,
    proposal: built.proposal,
    proposalError: built.error,
    reports,
  };
}
