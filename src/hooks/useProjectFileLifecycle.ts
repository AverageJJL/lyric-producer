import {useCallback, useRef, useState} from 'react';

import {
  createNewApcProject,
  currentSourceFiles,
  openApcProject,
  type ApcProjectActionResult,
  restoreApcProjectFromFiles,
  saveCurrentApcProject,
} from '../arrangement/apc';
import {
  clearAutosaveDraft,
  loadRecentProjects,
  readAutosaveDraft,
  rememberRecentProject,
  writeAutosaveDraft,
} from '../arrangement/projectLifecycleStorage';
import {
  captureProjectSnapshot,
  snapshotFingerprint,
} from '../arrangement/projectSnapshot';
import {getMediaImportBridge} from '../native/mediaImportApi';
import {getProjectFileBridge} from '../native/projectFileApi';
import {
  confirmDirtyProjectDiscard,
  useDirtyProjectUnloadPrompt,
} from './useDirtyProjectUnloadPrompt';
import {useAppProjectCommands} from './useAppProjectCommands';
import {useDawProjectFileLifecycle} from './useDawProjectFileLifecycle';
import {useProjectPersistenceWatch} from './useProjectPersistenceWatch';
import {useProjectExportLifecycle} from './useProjectExportLifecycle';

export type {ProjectFileLifecycle} from './projectFileLifecycleTypes';

function displayNameFromPath(path: string | null): string {
  const name = path?.split(/[\\/]/).pop();
  return name ? name.replace(/\.apc$/i, '') : 'Untitled';
}

export function useProjectFileLifecycle() {
  const [currentPath, setCurrentPath] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [hasAutosave, setHasAutosave] = useState(() => readAutosaveDraft() !== null);
  const [recentProjects, setRecentProjects] = useState(() => loadRecentProjects());
  const [statusMessage, setStatusMessage] = useState('Unsaved project');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const savedFingerprintRef = useRef<string | null>(
    snapshotFingerprint(captureProjectSnapshot()),
  );

  const confirmDiscardDirtyChanges = useCallback(
    () => confirmDirtyProjectDiscard(isDirty),
    [isDirty],
  );
  useDirtyProjectUnloadPrompt(isDirty);

  const writeCurrentAutosave = useCallback(() => {
    writeAutosaveDraft({
      path: currentPath,
      files: currentSourceFiles(),
      savedFingerprint:
        savedFingerprintRef.current ?? snapshotFingerprint(captureProjectSnapshot()),
      savedAt: new Date().toISOString(),
    });
    setHasAutosave(true);
  }, [currentPath]);

  useProjectPersistenceWatch({savedFingerprintRef, setIsDirty, writeCurrentAutosave});

  const applySavedState = useCallback((path: string | undefined, fingerprint: string) => {
    savedFingerprintRef.current = fingerprint;
    setCurrentPath(path ?? null);
    if (path) {
      setRecentProjects(rememberRecentProject(path));
    }
    setIsDirty(false);
    setErrorMessage(null);
    clearAutosaveDraft();
    setHasAutosave(false);
  }, []);

  const runFileAction = useCallback(
    async (
      action: () => Promise<ApcProjectActionResult>,
      successMessage: string,
      options?: {confirmDiscard?: boolean},
    ) => {
      if (options?.confirmDiscard && !confirmDiscardDirtyChanges()) {
        return;
      }

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
        applySavedState(result.path, result.fingerprint);
        const statusDetail = result.failedMediaCount && result.failedMediaCount > 0
          ? `${result.consolidatedMediaCount ?? 0} media consolidated; ${result.failedMediaCount} failed`
          : result.consolidatedMediaCount && result.consolidatedMediaCount > 0
            ? `${result.consolidatedMediaCount} media consolidated`
            : result.missingMediaCount && result.missingMediaCount > 0
              ? `${result.missingMediaCount} missing media`
              : null;
        setStatusMessage(
          statusDetail ? `${successMessage} (${statusDetail})` : successMessage,
        );
      } finally {
        setIsBusy(false);
      }
    },
    [applySavedState, confirmDiscardDirtyChanges],
  );

  const newProject = useCallback(async () => {
    if (!confirmDiscardDirtyChanges()) {
      return;
    }

    const result = await createNewApcProject(getProjectFileBridge());
    if (result.ok) {
      applySavedState(undefined, result.fingerprint);
      setStatusMessage('New project');
    }
  }, [applySavedState, confirmDiscardDirtyChanges]);

  const openProject = useCallback(
    () =>
      runFileAction(
        () => openApcProject(getProjectFileBridge(), undefined, getMediaImportBridge()),
        'Project opened',
        {confirmDiscard: true},
      ),
    [runFileAction],
  );

  const openRecentProject = useCallback(
    (path: string) =>
      runFileAction(
        () => openApcProject(getProjectFileBridge(), path, getMediaImportBridge()),
        'Project opened',
        {confirmDiscard: true},
      ),
    [runFileAction],
  );

  const saveProject = useCallback(
    () =>
      runFileAction(
        () => saveCurrentApcProject(
          getProjectFileBridge(),
          currentPath,
          {consolidateMedia: true, mediaBridge: getMediaImportBridge()},
        ),
        'Project saved',
      ),
    [currentPath, runFileAction],
  );

  const saveProjectAs = useCallback(
    () =>
      runFileAction(
        () => saveCurrentApcProject(
          getProjectFileBridge(),
          undefined,
          {consolidateMedia: true, mediaBridge: getMediaImportBridge()},
        ),
        'Project saved',
      ),
    [runFileAction],
  );

  const {
    exportMixdown,
    exportCycleMixdown,
    exportSelectedClip,
    exportStems,
    exportMidi,
    cancelExport,
    canCancelExport,
  } = useProjectExportLifecycle({
    setIsBusy,
    setErrorMessage,
    setStatusMessage,
  });

  const {
    exportDawProject,
    importDawProject,
    importDawProjectPath,
  } = useDawProjectFileLifecycle({
    confirmDiscardDirtyChanges,
    currentPath,
    savedFingerprintRef,
    setCurrentPath,
    setErrorMessage,
    setHasAutosave,
    setIsBusy,
    setIsDirty,
    setStatusMessage,
  });

  const recoverAutosave = useCallback(async () => {
    if (!confirmDiscardDirtyChanges()) {
      return;
    }

    const draft = readAutosaveDraft();
    if (!draft) {
      setStatusMessage('No autosave draft');
      setHasAutosave(false);
      return;
    }

    const result = restoreApcProjectFromFiles(draft.files);
    if (!result.ok) {
      setErrorMessage(result.error);
      setStatusMessage(result.error);
      return;
    }

    const currentFingerprint = result.fingerprint;
    savedFingerprintRef.current = draft.savedFingerprint;
    setCurrentPath(draft.path);
    if (draft.path) {
      setRecentProjects(rememberRecentProject(draft.path));
    }
    setIsDirty(currentFingerprint !== draft.savedFingerprint);
    setErrorMessage(null);
    setStatusMessage('Autosave recovered');
    setHasAutosave(true);
  }, [confirmDiscardDirtyChanges]);

  useAppProjectCommands({
    exportMidi,
    exportDawProject,
    exportMixdown,
    exportStems,
    importDawProject,
    importDawProjectPath,
    newProject,
    openProject,
    openRecentProject,
    recoverAutosave,
    saveProject,
    saveProjectAs,
  });

  return {
    currentPath,
    displayName: displayNameFromPath(currentPath),
    isDirty,
    isBusy,
    hasAutosave,
    recentProjects,
    statusMessage,
    errorMessage,
    newProject,
    openProject,
    openRecentProject,
    importDawProject,
    importDawProjectPath,
    saveProject,
    saveProjectAs,
    exportMixdown,
    exportCycleMixdown,
    exportSelectedClip,
    exportStems,
    exportMidi,
    exportDawProject,
    cancelExport,
    canCancelExport,
    recoverAutosave,
  };
}
