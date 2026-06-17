import {useCallback, type Dispatch, type MutableRefObject, type SetStateAction} from 'react';

import {
  exportDawProjectFile,
  importDawProjectFile,
  type DawProjectFileActionResult,
} from '../arrangement/dawProjectActions';
import {createProjectDocument, serializeProjectDocument} from '../arrangement/projectDocument';
import {captureProjectSnapshot} from '../arrangement/projectSnapshot';
import {writeAutosaveDraft} from '../arrangement/projectLifecycleStorage';
import {getProjectFileBridge} from '../native/projectFileApi';

type DawProjectLifecycleOptions = {
  currentPath: string | null;
  confirmDiscardDirtyChanges: () => boolean;
  savedFingerprintRef: MutableRefObject<string | null>;
  setCurrentPath: Dispatch<SetStateAction<string | null>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
  setHasAutosave: Dispatch<SetStateAction<boolean>>;
  setIsBusy: Dispatch<SetStateAction<boolean>>;
  setIsDirty: Dispatch<SetStateAction<boolean>>;
  setStatusMessage: Dispatch<SetStateAction<string>>;
};

function importStatus(result: Extract<DawProjectFileActionResult, {ok: true}>): string {
  const details = [
    `${result.importedTrackCount ?? 0} tracks`,
    `${result.importedClipCount ?? 0} clips`,
  ];
  if (result.skippedClipCount) {
    details.push(`${result.skippedClipCount} skipped`);
  }
  if (result.missingMediaCount) {
    details.push(`${result.missingMediaCount} missing media`);
  }
  if (result.failedAnalysisCount) {
    details.push(`${result.failedAnalysisCount} unanalyzed media`);
  }
  if (result.unsupportedContentCount) {
    details.push(`${result.unsupportedContentCount} unsupported items`);
  }
  return `DAWproject imported (${details.join('; ')})`;
}

function exportStatus(result: Extract<DawProjectFileActionResult, {ok: true}>): string {
  return result.skippedMediaCount && result.skippedMediaCount > 0
    ? `DAWproject exported (${result.skippedMediaCount} media skipped)`
    : 'DAWproject exported';
}

function writeImportedAutosave(savedFingerprint: string): void {
  const snapshot = captureProjectSnapshot();
  writeAutosaveDraft({
    content: serializeProjectDocument(createProjectDocument(snapshot)),
    path: null,
    savedAt: new Date().toISOString(),
    savedFingerprint,
  });
}

export function useDawProjectFileLifecycle(options: DawProjectLifecycleOptions) {
  const {
    confirmDiscardDirtyChanges,
    currentPath,
    savedFingerprintRef,
    setCurrentPath,
    setErrorMessage,
    setHasAutosave,
    setIsBusy,
    setIsDirty,
    setStatusMessage,
  } = options;

  const markImportedDirty = useCallback((fingerprint: string) => {
    const unsavedFingerprint = `dawproject-import:${fingerprint}`;
    savedFingerprintRef.current = unsavedFingerprint;
    setCurrentPath(null);
    setIsDirty(true);
    setErrorMessage(null);
    writeImportedAutosave(unsavedFingerprint);
    setHasAutosave(true);
  }, [savedFingerprintRef, setCurrentPath, setErrorMessage, setHasAutosave, setIsDirty]);

  const runDawProjectAction = useCallback(async (
    action: () => Promise<DawProjectFileActionResult>,
    onSuccess: (result: Extract<DawProjectFileActionResult, {ok: true}>) => void,
  ) => {
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const result = await action();
      if (!result.ok) {
        if (!result.canceled) {
          setErrorMessage(result.error);
          setStatusMessage(result.error);
        }
        return;
      }
      onSuccess(result);
    } finally {
      setIsBusy(false);
    }
  }, [setErrorMessage, setIsBusy, setStatusMessage]);

  const exportDawProject = useCallback(
    () => runDawProjectAction(
      () => exportDawProjectFile(getProjectFileBridge(), currentPath),
      result => setStatusMessage(exportStatus(result)),
    ),
    [currentPath, runDawProjectAction, setStatusMessage],
  );

  const importDawProjectPath = useCallback(async (path?: string | null) => {
    if (!confirmDiscardDirtyChanges()) {
      return;
    }
    await runDawProjectAction(
      () => importDawProjectFile(getProjectFileBridge(), path),
      result => {
        markImportedDirty(result.fingerprint);
        setStatusMessage(importStatus(result));
      },
    );
  }, [confirmDiscardDirtyChanges, markImportedDirty, runDawProjectAction, setStatusMessage]);

  const importDawProject = useCallback(
    () => importDawProjectPath(undefined),
    [importDawProjectPath],
  );

  return {exportDawProject, importDawProject, importDawProjectPath};
}
