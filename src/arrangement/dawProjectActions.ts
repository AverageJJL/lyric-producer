import {clearArrangementHistory} from '../store/history';
import type {AudioAnalysis} from '../music/audioImport';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../native/NativeAudioEngine';
import type {ProjectFileBridge} from '../native/projectFileApi';
import {captureProjectSnapshot, snapshotFingerprint} from './projectSnapshot';
import {restoreProjectSnapshot} from './projectRestore';
import {buildDawProjectExport} from './dawProjectExport';
import {dawProjectSnapshotFromPackage} from './dawProjectImport';
import type {DawProjectImportedMedia} from './dawProjectTypes';

export type DawProjectFileActionResult =
  | {
      ok: true;
      path?: string;
      fingerprint: string;
      failedAnalysisCount?: number;
      importedClipCount?: number;
      importedTrackCount?: number;
      missingMediaCount?: number;
      skippedClipCount?: number;
      skippedMediaCount?: number;
      unsupportedContentCount?: number;
    }
  | {ok: false; error: string; canceled?: boolean};

function unavailableResult(): DawProjectFileActionResult {
  return {ok: false, error: 'DAWproject file API is unavailable.'};
}

function parseCommandData(response: string | null): Record<string, unknown> | null {
  if (!response) {
    return null;
  }
  try {
    const parsed = JSON.parse(response) as {ok?: boolean; data?: Record<string, unknown>};
    return parsed.ok === true ? parsed.data ?? null : null;
  } catch {
    return null;
  }
}

async function analyzeAudioFile(absolutePath: string): Promise<AudioAnalysis | null> {
  const data = parseCommandData(await sendNativeAudioCommandAsync('analyze_audio_file', {
    absoluteAudioFilePath: absolutePath,
  }));
  return data ? data as AudioAnalysis : null;
}

function currentEngineSampleRate(): number | undefined {
  const data = parseCommandData(sendNativeAudioCommand('engine_status_fast', {}));
  const sampleRate = data?.sampleRate;
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0
    ? sampleRate
    : undefined;
}

function dawProjectDefaultPath(currentPath?: string | null): string {
  const fileName = currentPath?.split(/[\\/]/).pop() ?? 'Untitled';
  return `${fileName.replace(/\.(apcproject|json)$/i, '')}.dawproject`;
}

export async function exportDawProjectFile(
  bridge: ProjectFileBridge | null,
  currentPath?: string | null,
): Promise<DawProjectFileActionResult> {
  if (!bridge?.exportDawProject) {
    return unavailableResult();
  }
  const snapshot = captureProjectSnapshot();
  const dawProject = buildDawProjectExport(snapshot);
  const response = await bridge.exportDawProject({
    defaultPath: dawProjectDefaultPath(currentPath),
    extensionJson: dawProject.extensionJson,
    mediaFiles: dawProject.mediaFiles,
    metadataXml: dawProject.metadataXml,
    projectXml: dawProject.projectXml,
  });
  if (!response.ok) {
    return response;
  }
  return {
    ok: true,
    path: response.path,
    fingerprint: snapshotFingerprint(snapshot),
    skippedMediaCount: dawProject.skippedMediaCount,
  };
}

export async function importDawProjectFile(
  bridge: ProjectFileBridge | null,
  path?: string | null,
): Promise<DawProjectFileActionResult> {
  if (!bridge?.importDawProject) {
    return unavailableResult();
  }
  const response = await bridge.importDawProject(path ? {path} : undefined);
  if (!response.ok) {
    return response;
  }
  const analyses = new Map<string, AudioAnalysis | null>();
  for (const media of response.mediaFiles) {
    analyses.set(media.archivePath, await analyzeAudioFile(media.absolutePath));
  }
  const imported = dawProjectSnapshotFromPackage({
    extensionJson: response.extensionJson,
    mediaFiles: response.mediaFiles,
    metadataXml: response.metadataXml,
    projectXml: response.projectXml,
  }, (media: DawProjectImportedMedia) => analyses.get(media.archivePath) ?? null, currentEngineSampleRate());
  if (!imported.ok) {
    return imported;
  }
  const snapshot = restoreProjectSnapshot(imported.snapshot);
  clearArrangementHistory();
  return {
    ok: true,
    failedAnalysisCount: imported.failedAnalysisCount,
    fingerprint: snapshotFingerprint(snapshot),
    importedClipCount: imported.importedClipCount,
    importedTrackCount: imported.importedTrackCount,
    missingMediaCount: imported.missingMediaCount,
    skippedClipCount: imported.skippedClipCount,
    unsupportedContentCount: imported.unsupportedContentCount,
  };
}
