import {clearArrangementHistory} from '../../store/history';
import type {ProjectFileBridge} from '../../native/projectFileApi';
import type {MediaImportBridge} from '../../native/mediaImportApi';
import {
  captureProjectSnapshot,
  emptyProjectSnapshot,
  snapshotFingerprint,
} from '../projectSnapshot';
import {restoreProjectSnapshot} from '../projectRestore';
import {resolveProjectMediaReferences} from '../projectMediaResolution';
import {consolidateProjectMediaSources} from '../projectMediaConsolidation';
import {decomposeSnapshotToApcSource, serializeApcSource} from './apcDecompose';
import {parseApcSourceFiles} from './apcParse';
import {compileApcSourceToSnapshot} from './apcCompile';
import type {ApcSourceFile} from './apcSourceTypes';

export type ApcProjectActionResult =
  | {
      ok: true;
      path?: string;
      fingerprint: string;
      missingMediaCount?: number;
      consolidatedMediaCount?: number;
      failedMediaCount?: number;
    }
  | {ok: false; error: string; canceled?: boolean};

export type SaveApcProjectOptions = {
  consolidateMedia?: boolean;
  mediaBridge?: MediaImportBridge | null;
};

function unavailableResult(): ApcProjectActionResult {
  return {ok: false, error: 'Project folder API is unavailable.'};
}

/** Serialize the live store into the `.apc` source tree, ready for disk. */
function currentSourceFiles(): ApcSourceFile[] {
  const snapshot = captureProjectSnapshot();
  const source = decomposeSnapshotToApcSource(snapshot, new Date().toISOString());
  return serializeApcSource(source);
}

export async function saveCurrentApcProject(
  bridge: ProjectFileBridge | null,
  folderPath?: string | null,
  options?: SaveApcProjectOptions,
): Promise<ApcProjectActionResult> {
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

  // Capture AFTER consolidation so the written tree references the consolidated
  // (project-local) media paths rather than the pre-consolidation originals.
  const snapshot = captureProjectSnapshot();
  const files = serializeApcSource(decomposeSnapshotToApcSource(snapshot, new Date().toISOString()));
  const response = await bridge.saveProjectFolder({
    files,
    ...(folderPath ? {folderPath} : {}),
  });
  if (!response.ok) {
    return response;
  }

  // Re-home the engine's writable asset root onto the (possibly new) project folder
  // so subsequent recordings/renders land inside Song.apc/assets.
  await bridge.setProjectAssetRoot({folderPath: response.path});

  return {
    ok: true,
    path: response.path,
    fingerprint: snapshotFingerprint(snapshot),
    consolidatedMediaCount,
    failedMediaCount,
  };
}

export async function openApcProject(
  bridge: ProjectFileBridge | null,
  folderPath?: string | null,
  mediaBridge?: MediaImportBridge | null,
): Promise<ApcProjectActionResult> {
  if (!bridge) {
    return unavailableResult();
  }

  const response = await bridge.openProjectFolder(folderPath ? {path: folderPath} : undefined);
  if (!response.ok) {
    return response;
  }

  const parsed = parseApcSourceFiles(response.files);
  if (!parsed.ok) {
    return {ok: false, error: parsed.error};
  }
  const compiled = compileApcSourceToSnapshot(parsed.source);
  if (!compiled.ok) {
    return {ok: false, error: compiled.errors[0]?.message ?? 'Project source is invalid.'};
  }

  // Point native at the project's asset root BEFORE resolving media so relative
  // audio paths resolve against the correct folder.
  await bridge.setProjectAssetRoot({folderPath: response.path});

  const resolved = await resolveProjectMediaReferences(mediaBridge ?? null, compiled.snapshot);
  const snapshot = restoreProjectSnapshot(resolved.snapshot);
  clearArrangementHistory();
  return {
    ok: true,
    path: response.path,
    fingerprint: snapshotFingerprint(snapshot),
    missingMediaCount: resolved.missingMediaCount,
  };
}

/** Recover an autosaved `.apc` source tree (held in app storage) into the store. */
export function restoreApcProjectFromFiles(files: ApcSourceFile[]): ApcProjectActionResult {
  const parsed = parseApcSourceFiles(files);
  if (!parsed.ok) {
    return {ok: false, error: parsed.error};
  }
  const compiled = compileApcSourceToSnapshot(parsed.source);
  if (!compiled.ok) {
    return {ok: false, error: compiled.errors[0]?.message ?? 'Autosave source is invalid.'};
  }
  const snapshot = restoreProjectSnapshot(compiled.snapshot);
  clearArrangementHistory();
  return {ok: true, fingerprint: snapshotFingerprint(snapshot)};
}

export async function createNewApcProject(
  bridge?: ProjectFileBridge | null,
): Promise<ApcProjectActionResult> {
  const snapshot = restoreProjectSnapshot(emptyProjectSnapshot());
  clearArrangementHistory();
  // Reset the writable asset root back to the unsaved-draft area.
  await bridge?.setProjectAssetRoot({folderPath: null});
  return {ok: true, fingerprint: snapshotFingerprint(snapshot)};
}

export {currentSourceFiles};
