import type {ApcSourceFile} from './apc';

const RECENT_PROJECTS_KEY = 'aiProducerCore.recentProjects';
const AUTOSAVE_DRAFT_KEY = 'aiProducerCore.autosaveDraft';
const MAX_RECENT_PROJECTS = 8;

/**
 * Autosave holds the `.apc` SOURCE TREE (an array of small JSON files), not a
 * single document blob. Media bytes are never in the tree — they live under the
 * project/draft asset folder and are referenced by relative path — so the JSON
 * tree stays small enough for app storage. `path` is the project folder (null for
 * an unsaved draft).
 */
export type AutosaveDraft = {
  path: string | null;
  files: ApcSourceFile[];
  savedFingerprint: string;
  savedAt: string;
};

function browserStorage(): Storage | null {
  try {
    return globalThis.window?.localStorage ?? null;
  } catch {
    return null;
  }
}

function uniqueProjectPaths(paths: string[]): string[] {
  return [...new Set(paths.filter(path => path.trim().length > 0))];
}

export function loadRecentProjects(storage = browserStorage()): string[] {
  if (!storage) {
    return [];
  }

  try {
    const parsed = JSON.parse(storage.getItem(RECENT_PROJECTS_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? uniqueProjectPaths(parsed.filter((item): item is string => typeof item === 'string'))
      : [];
  } catch {
    return [];
  }
}

export function rememberRecentProject(path: string, storage = browserStorage()): string[] {
  const recent = uniqueProjectPaths([path, ...loadRecentProjects(storage)]).slice(
    0,
    MAX_RECENT_PROJECTS,
  );
  storage?.setItem(RECENT_PROJECTS_KEY, JSON.stringify(recent));
  return recent;
}

export function writeAutosaveDraft(
  draft: AutosaveDraft,
  storage = browserStorage(),
): void {
  storage?.setItem(AUTOSAVE_DRAFT_KEY, JSON.stringify(draft));
}

export function readAutosaveDraft(storage = browserStorage()): AutosaveDraft | null {
  if (!storage) {
    return null;
  }

  try {
    const parsed = JSON.parse(storage.getItem(AUTOSAVE_DRAFT_KEY) ?? 'null');
    if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray(parsed.files) &&
      parsed.files.every(
        (file: unknown) =>
          file &&
          typeof file === 'object' &&
          typeof (file as ApcSourceFile).relativePath === 'string' &&
          typeof (file as ApcSourceFile).content === 'string',
      ) &&
      typeof parsed.savedFingerprint === 'string' &&
      typeof parsed.savedAt === 'string' &&
      (typeof parsed.path === 'string' || parsed.path === null)
    ) {
      return parsed as AutosaveDraft;
    }
  } catch {
    return null;
  }

  return null;
}

export function clearAutosaveDraft(storage = browserStorage()): void {
  storage?.removeItem(AUTOSAVE_DRAFT_KEY);
}
