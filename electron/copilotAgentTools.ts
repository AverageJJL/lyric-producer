import {
  AGENT_GREP_MAX_MATCHES,
  AGENT_GREP_SNIPPET_MAX,
  AGENT_LIST_MAX_RESULTS,
  AGENT_READ_MAX_BYTES,
} from './copilotAgentContract';

/** Structural mirror of the renderer's ApcVirtualTree (electron tsconfig can't import src/). */
export type ApcAgentTree = {
  fingerprint: string;
  files: Record<string, string>;
  index: Array<{path: string; bytes: number; contentHash: string}>;
};

/** Minimal, anchored glob: `*` is the only wildcard (e.g. "tracks/*.json"). */
function matchesGlob(filePath: string, glob?: string): boolean {
  if (!glob || glob === '*') {
    return true;
  }
  try {
    const pattern = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${pattern}$`).test(filePath);
  } catch {
    return false;
  }
}

export function listProjectFiles(tree: ApcAgentTree, args: {glob?: string; maxResults?: number}) {
  const cap = Math.min(args.maxResults ?? AGENT_LIST_MAX_RESULTS, AGENT_LIST_MAX_RESULTS);
  const all = tree.index.filter(entry => matchesGlob(entry.path, args.glob));
  const files = all.slice(0, cap).map(entry => ({path: entry.path, bytes: entry.bytes}));
  return {files, total: all.length, truncated: all.length > files.length};
}

export function readProjectFile(tree: ApcAgentTree, args: {path: string; maxBytes?: number}) {
  const entry = tree.index.find(item => item.path === args.path);
  const content = tree.files[args.path];
  if (!entry || content === undefined) {
    return {error: `unknown path: ${args.path}`};
  }
  const cap = Math.min(args.maxBytes ?? AGENT_READ_MAX_BYTES, AGENT_READ_MAX_BYTES);
  const truncated = content.length > cap;
  const body = truncated
    ? `${content.slice(0, cap)}\n… <${content.length - cap} bytes omitted>`
    : content;
  return {path: args.path, content: body, bytes: content.length, truncated, contentHash: entry.contentHash};
}

/**
 * Build a search regex. Literal patterns are escaped; regex patterns are length-capped
 * and rejected if they contain obvious catastrophic-backtracking shapes (nested
 * quantifiers), falling back to a literal search — a pragmatic ReDoS guard given the
 * files are tiny JSON.
 */
function searchRegex(pattern: string, isRegex: boolean): RegExp | null {
  if (typeof pattern !== 'string' || pattern.length === 0 || pattern.length > 200) {
    return null;
  }
  if (isRegex && !/[+*]\s*[+*]|\)[+*][+*]|\(\?[:=!]/.test(pattern)) {
    try {
      return new RegExp(pattern, 'i');
    } catch {
      // fall through to literal
    }
  }
  return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

export function grepProjectFiles(
  tree: ApcAgentTree,
  args: {pattern: string; glob?: string; isRegex?: boolean; maxMatches?: number},
) {
  const cap = Math.min(args.maxMatches ?? AGENT_GREP_MAX_MATCHES, AGENT_GREP_MAX_MATCHES);
  const regex = searchRegex(args.pattern, args.isRegex === true);
  if (!regex) {
    return {matches: [], truncated: false, error: 'invalid pattern'};
  }
  const matches: Array<{path: string; line: number; snippet: string}> = [];
  let truncated = false;
  for (const entry of tree.index) {
    if (!matchesGlob(entry.path, args.glob)) {
      continue;
    }
    const lines = (tree.files[entry.path] ?? '').split('\n');
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      if (regex.test(lines[lineIndex])) {
        matches.push({
          path: entry.path,
          line: lineIndex + 1,
          snippet: lines[lineIndex].slice(0, AGENT_GREP_SNIPPET_MAX),
        });
        if (matches.length >= cap) {
          truncated = true;
          break;
        }
      }
    }
    if (truncated) {
      break;
    }
  }
  return {matches, truncated};
}

/** Dispatch a read-only tool call to its handler. Returns a JSON-serializable result. */
export function executeReadOnlyTool(
  tree: ApcAgentTree,
  name: string,
  args: Record<string, unknown> | undefined,
): unknown {
  const safeArgs = args ?? {};
  switch (name) {
    case 'list_project_files':
      return listProjectFiles(tree, safeArgs as {glob?: string; maxResults?: number});
    case 'read_project_file':
      return readProjectFile(tree, safeArgs as {path: string; maxBytes?: number});
    case 'grep_project_files':
      return grepProjectFiles(
        tree,
        safeArgs as {pattern: string; glob?: string; isRegex?: boolean; maxMatches?: number},
      );
    default:
      return {error: `Unknown tool: ${name}`};
  }
}
