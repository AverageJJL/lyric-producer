import {clearArrangementHistory} from '../store/history';
import type {ProjectFileBridge} from '../native/projectFileApi';
import type {MediaImportBridge} from '../native/mediaImportApi';
import {
  createProjectDocument,
  openProjectDocument,
  parseProjectDocument,
  serializeProjectDocument,
} from './projectDocument';
import {
  captureProjectSnapshot,
  emptyProjectSnapshot,
  snapshotFingerprint,
} from './projectSnapshot';
import {restoreProjectSnapshot} from './projectRestore';
import {resolveProjectMediaReferences} from './projectMediaResolution';
import {consolidateProjectMediaSources} from './projectMediaConsolidation';

export type ProjectFileActionResult =
  | {
      ok: true;
      path?: string;
      fingerprint: string;
      missingMediaCount?: number;
      consolidatedMediaCount?: number;
      failedMediaCount?: number;
    }
  | {ok: false; error: string; canceled?: boolean};

export type SaveProjectFileOptions = {
  consolidateMedia?: boolean;
  mediaBridge?: MediaImportBridge | null;
};

function unavailableResult(): ProjectFileActionResult {
  return {
    ok: false,
    error: 'Project file API is unavailable.',
  };
}

export async function saveCurrentProjectFile(
  bridge: ProjectFileBridge | null,
  path?: string | null,
  options?: SaveProjectFileOptions,
): Promise<ProjectFileActionResult> {
  if (!bridge) {
    return unavailableResult();
  }

  let consolidatedMediaCount = 0;
  let failedMediaCount = 0;
  if (options?.consolidateMedia) {
    const consolidation = await consolidateProjectMediaSources(options.mediaBridge ?? null);
    if (!consolidation.ok) {
      return consolidation;
    }
    consolidatedMediaCount = consolidation.consolidatedClipCount;
    failedMediaCount = consolidation.failedClipCount;
  }

  const snapshot = captureProjectSnapshot();
  const content = serializeProjectDocument(createProjectDocument(snapshot));
  const response = await bridge.saveProject({
    content,
    ...(path ? {path} : {}),
  });

  if (!response.ok) {
    return response;
  }

  return {
    ok: true,
    path: response.path,
    fingerprint: snapshotFingerprint(snapshot),
    consolidatedMediaCount,
    failedMediaCount,
  };
}

export async function openProjectFile(
  bridge: ProjectFileBridge | null,
  path?: string | null,
  mediaBridge?: MediaImportBridge | null,
): Promise<ProjectFileActionResult> {
  if (!bridge) {
    return unavailableResult();
  }

  const response = await bridge.openProject(path ? {path} : undefined);
  if (!response.ok) {
    return response;
  }

  const parsed = parseProjectDocument(response.content);
  if (!parsed.ok) {
    return {ok: false, error: parsed.error};
  }

  const resolved = await resolveProjectMediaReferences(mediaBridge ?? null, parsed.document.snapshot);
  const snapshot = openProjectDocument({
    ...parsed.document,
    snapshot: resolved.snapshot,
  });
  clearArrangementHistory();
  return {
    ok: true,
    path: response.path,
    fingerprint: snapshotFingerprint(snapshot),
    missingMediaCount: resolved.missingMediaCount,
  };
}

export function restoreProjectFileContent(content: string): ProjectFileActionResult {
  const parsed = parseProjectDocument(content);
  if (!parsed.ok) {
    return {ok: false, error: parsed.error};
  }

  const snapshot = openProjectDocument(parsed.document);
  clearArrangementHistory();
  return {
    ok: true,
    fingerprint: snapshotFingerprint(snapshot),
  };
}

export function createNewProjectFile(): ProjectFileActionResult {
  const snapshot = restoreProjectSnapshot(emptyProjectSnapshot());
  clearArrangementHistory();
  return {
    ok: true,
    fingerprint: snapshotFingerprint(snapshot),
  };
}
