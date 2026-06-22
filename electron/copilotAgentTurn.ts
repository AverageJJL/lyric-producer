/**
 * Pure per-turn parsing + Stage-A validation helpers for the agent loop. Split out
 * of copilotAgentLoop.ts to keep each file focused (and under the line budget): this
 * module knows how to read a model turn's arguments and gate them; the loop module
 * owns control flow + the HTTP calls.
 */
import {AGENT_PATCH_MAX_CHANGES, type ApcPatchTransaction} from './copilotAgentContract';
import {COPILOT_RESPONSE_LIMITS} from './copilotContract';
import type {ApcAgentTree} from './copilotAgentTools';

export type CopilotAgentRequest = {
  message?: unknown;
  history?: unknown;
  conversationSummary?: unknown;
  context?: unknown;
  tree?: ApcAgentTree;
  /** 'ask' selects the read-only Session Companion persona/toolset; default 'build'. */
  mode?: unknown;
};

/**
 * The raw `answer_copilot` arguments the model emitted. The MAIN process stays
 * "dumb": it only checks shape + caps here. All semantic validation (live-DOM target
 * IDs, catalog instrument IDs, track/lock checks) happens in the RENDERER via
 * sanitizeCopilotAnswer, where the live store + DOM exist — one authoritative
 * validation site, no drift.
 */
export type CopilotAgentAnswer = {
  actions: unknown[];
  midiBlockEdits: unknown[];
  midiOptions: unknown[];
  drumPatternOptions: unknown[];
  drumPatternEdits: unknown[];
};

export function cleanString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function parseArgs(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Light shape/cap gate for an `answer_copilot` tool call. Returns the trimmed text +
 * capped arrays, or {ok:false} when there is no usable text (so the loop can ask the
 * model to retry). NOT semantic validation — that is the renderer's job.
 */
export function rawAnswerFromArgs(
  args: Record<string, unknown>,
): {ok: true; text: string; answer: CopilotAgentAnswer} | {ok: false} {
  const text = cleanString(args.text);
  if (!text) {
    return {ok: false};
  }
  const arr = (value: unknown, cap: number) => (Array.isArray(value) ? value.slice(0, cap) : []);
  return {
    ok: true,
    text,
    answer: {
      actions: arr(args.actions, COPILOT_RESPONSE_LIMITS.actions),
      midiBlockEdits: arr(args.midiBlockEdits, COPILOT_RESPONSE_LIMITS.midiBlockEdits),
      midiOptions: arr(args.midiOptions, COPILOT_RESPONSE_LIMITS.midiOptions),
      drumPatternOptions: arr(args.drumPatternOptions, COPILOT_RESPONSE_LIMITS.drumPatternOptions),
      drumPatternEdits: arr(args.drumPatternEdits, COPILOT_RESPONSE_LIMITS.drumPatternEdits),
    },
  };
}

export function patchFromArgs(args: Record<string, unknown>): ApcPatchTransaction {
  return {
    schemaVersion: 1 as const,
    baseFingerprint: String(args.baseFingerprint ?? ''),
    summary: String(args.summary ?? ''),
    changes: Array.isArray(args.changes) ? (args.changes as ApcPatchTransaction['changes']) : [],
  };
}

type EntityRule = {
  dir: string;
  label: string;
  idPath: string[];
};

const ENTITY_RULES: EntityRule[] = [
  {dir: 'tracks', label: 'Track file', idPath: ['id']},
  {dir: 'clips', label: 'Clip file', idPath: ['id']},
  {dir: 'patterns', label: 'Pattern file', idPath: ['id']},
  {dir: 'fx', label: 'FX file', idPath: ['fx', 'trackId']},
];

function idFromEntityPath(path: string, dir: string): string | null {
  const prefix = `${dir}/`;
  const suffix = '.json';
  if (!path.startsWith(prefix) || !path.endsWith(suffix)) {
    return null;
  }
  const encoded = path.slice(prefix.length, -suffix.length);
  if (!encoded || encoded.includes('/')) {
    return null;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

function nestedString(value: unknown, keys: string[]): string | null {
  let current = value;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !(key in current)) {
      return null;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return typeof current === 'string' && current.length > 0 ? current : null;
}

function ruleForEntityPath(path: string): EntityRule | null {
  return ENTITY_RULES.find(item => path.startsWith(`${item.dir}/`) && path.endsWith('.json')) ?? null;
}

function jsonAfterChange(tree: ApcAgentTree, change: ApcPatchTransaction['changes'][number]): unknown {
  if (change.op === 'mergeFields') {
    const base = JSON.parse(tree.files[change.path] ?? '{}') as Record<string, unknown>;
    return {...base, ...(change.fields ?? {})};
  }
  const content = 'content' in change && typeof change.content === 'string' ? change.content : '{}';
  return JSON.parse(content);
}

function validateEntityPathId(tree: ApcAgentTree, change: ApcPatchTransaction['changes'][number]): string | null {
  if (change.op === 'deleteFile') {
    return null;
  }
  const rule = ruleForEntityPath(change.path);
  if (!rule) {
    return null;
  }
  const expectedId = idFromEntityPath(change.path, rule.dir);
  if (!expectedId) {
    return `${rule.label} "${change.path}" has an invalid entity path.`;
  }
  let parsed: unknown;
  try {
    parsed = jsonAfterChange(tree, change);
  } catch {
    return `${rule.label} "${change.path}" must contain valid JSON.`;
  }
  const actualId = nestedString(parsed, rule.idPath);
  if (actualId !== expectedId) {
    const field = rule.idPath.join('.');
    return `${rule.label} "${change.path}" must contain ${field} "${expectedId}" (received "${actualId ?? 'missing'}").`;
  }
  return null;
}

/**
 * The single user message holding the request + heavy context + tree index. Built once
 * before the loop and appended to (never rebuilt per turn) so context is sent only once.
 */
export function contextMessage(
  request: CopilotAgentRequest,
  message: string,
  tree: ApcAgentTree,
): string {
  return JSON.stringify({
    request: message,
    conversationSummary: cleanString(request.conversationSummary) ?? undefined,
    recentChat: Array.isArray(request.history) ? request.history : [],
    copilotContext: request.context ?? {},
    projectTree: {
      fingerprint: tree.fingerprint,
      // Include each file's contentHash so the model can set a change's beforeHash
      // directly for a blind metadata edit — saving a read_project_file round-trip on
      // the common case (e.g. mergeFields on project.json). It still reads when it
      // needs a file's actual contents (notes, FX params, etc.).
      files: tree.index.map(entry => ({path: entry.path, bytes: entry.bytes, hash: entry.contentHash})),
    },
  }).slice(0, 480_000);
}

/**
 * Whether to emit agent-loop telemetry to the main-process stderr (which dev.mjs
 * inherits into the terminal). On by default in dev (ELECTRON_RENDERER_URL set);
 * force with AI_PRODUCER_COPILOT_DEBUG=1, silence with =0.
 */
export function agentDebugEnabled(env: NodeJS.ProcessEnv): boolean {
  const explicit = env.AI_PRODUCER_COPILOT_DEBUG?.trim().toLowerCase();
  if (explicit === '0' || explicit === 'false') {
    return false;
  }
  return explicit === '1' || explicit === 'true' || Boolean(env.ELECTRON_RENDERER_URL);
}

/** Concurrency/structural patch checks (Stage A). The authoritative apply is renderer-side. */
export function validatePatchAgainstTree(tree: ApcAgentTree, patch: ApcPatchTransaction): string[] {
  const problems: string[] = [];
  if (patch.baseFingerprint !== tree.fingerprint) {
    problems.push('baseFingerprint does not match the current project; re-read files and retry.');
  }
  if (!Array.isArray(patch.changes) || patch.changes.length === 0) {
    problems.push('changes must be a non-empty array.');
    return problems;
  }
  if (patch.changes.length > AGENT_PATCH_MAX_CHANGES) {
    problems.push(`too many changes (max ${AGENT_PATCH_MAX_CHANGES}).`);
  }
  const hashByPath = new Map(tree.index.map(entry => [entry.path, entry.contentHash]));
  for (const change of patch.changes) {
    const unsafe = !change.path || change.path.split('/').some(s => s === '..' || s === '.' || s === '');
    if (unsafe) {
      problems.push(`unsafe path: ${change.path}`);
      continue;
    }
    if (change.op === 'createFile') {
      if (hashByPath.has(change.path)) {
        problems.push(`file already exists: ${change.path}; use mergeFields for existing top-level files or replaceFile with beforeHash.`);
      }
    } else {
      const expected = hashByPath.get(change.path);
      if (expected === undefined) {
        problems.push(`unknown file: ${change.path}`);
      } else if ((change as {beforeHash?: string}).beforeHash !== expected) {
        problems.push(`stale beforeHash for ${change.path}; re-read it and use the returned contentHash.`);
      }
    }
    const entityProblem = validateEntityPathId(tree, change);
    if (entityProblem) {
      problems.push(entityProblem);
    }
  }
  return problems;
}
