import {useCallback, useRef, useState} from 'react';

import {
  exportCycleRangeMixdown,
  exportCurrentMidi,
  exportCurrentMixdown,
  exportProjectStems,
  exportSelectedClipRender,
  type MidiExportMode,
  type ProjectExportActionResult,
} from '../arrangement/projectExportActions';
import type {ProjectExportProgress} from '../arrangement/projectExportProgress';
import {getProjectFileBridge} from '../native/projectFileApi';

type ProjectExportLifecycleConfig = {
  setIsBusy: (isBusy: boolean) => void;
  setErrorMessage: (message: string | null) => void;
  setStatusMessage: (message: string) => void;
};

export type ProjectExportLifecycle = {
  exportMixdown: () => Promise<void>;
  exportCycleMixdown: () => Promise<void>;
  exportSelectedClip: () => Promise<void>;
  exportStems: () => Promise<void>;
  exportMidi: (mode?: MidiExportMode) => Promise<void>;
  cancelExport: () => void;
  canCancelExport: boolean;
};

export function useProjectExportLifecycle({
  setIsBusy,
  setErrorMessage,
  setStatusMessage,
}: ProjectExportLifecycleConfig): ProjectExportLifecycle {
  const abortControllerRef = useRef<AbortController | null>(null);
  const [canCancelExport, setCanCancelExport] = useState(false);

  const cancelExport = useCallback(() => {
    const controller = abortControllerRef.current;
    if (!controller || controller.signal.aborted) {
      return;
    }
    controller.abort();
    setStatusMessage('Canceling export');
  }, [setStatusMessage]);

  const runExportAction = useCallback(async (
    action: (
      onProgress: (progress: ProjectExportProgress) => void,
      abortSignal: AbortSignal,
    ) =>
      Promise<ProjectExportActionResult>,
    successMessage: string,
    startMessage: string,
  ) => {
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsBusy(true);
    setCanCancelExport(true);
    setErrorMessage(null);
    setStatusMessage(startMessage);
    try {
      const result = await action(progress => setStatusMessage(progress.message), controller.signal);
      if (!result.ok && !result.canceled) {
        setErrorMessage(result.error);
        setStatusMessage(result.error);
      } else if (!result.ok && result.canceled) {
        setStatusMessage(result.error);
      } else if (result.ok) {
        setStatusMessage(successMessage);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : `${successMessage} failed.`;
      setErrorMessage(message);
      setStatusMessage(message);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setCanCancelExport(false);
      setIsBusy(false);
    }
  }, [setErrorMessage, setIsBusy, setStatusMessage]);

  const exportMixdown = useCallback(
    () => runExportAction(
      (onProgress, abortSignal) => exportCurrentMixdown(getProjectFileBridge(), {onProgress, abortSignal}),
      'Mixdown exported',
      'Starting mixdown export',
    ),
    [runExportAction],
  );

  const exportCycleMixdown = useCallback(
    () => runExportAction(
      (onProgress, abortSignal) => exportCycleRangeMixdown(getProjectFileBridge(), {onProgress, abortSignal}),
      'Cycle range exported',
      'Starting cycle range export',
    ),
    [runExportAction],
  );

  const exportMidi = useCallback(
    (mode: MidiExportMode = 'all') =>
      runExportAction(
        (onProgress, abortSignal) => exportCurrentMidi(getProjectFileBridge(), mode, {onProgress, abortSignal}),
        'MIDI exported',
        'Starting MIDI export',
      ),
    [runExportAction],
  );

  const exportStems = useCallback(
    () => runExportAction(
      (onProgress, abortSignal) => exportProjectStems(getProjectFileBridge(), {onProgress, abortSignal}),
      'Stems exported',
      'Starting stem export',
    ),
    [runExportAction],
  );

  const exportSelectedClip = useCallback(
    () => runExportAction(
      (onProgress, abortSignal) => exportSelectedClipRender(getProjectFileBridge(), {onProgress, abortSignal}),
      'Clip exported',
      'Starting clip export',
    ),
    [runExportAction],
  );

  return {
    exportMixdown,
    exportCycleMixdown,
    exportSelectedClip,
    exportStems,
    exportMidi,
    cancelExport,
    canCancelExport,
  };
}
