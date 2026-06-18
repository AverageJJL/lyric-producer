import {useEffect, type MutableRefObject} from 'react';

import {
  captureProjectSnapshot,
  projectSnapshotSourcesChanged,
  snapshotFingerprint,
} from '../arrangement/projectSnapshot';
import {useCopilotChatHistoryStore} from '../assistant/copilotChatHistory';
import {isCopilotStagePending, useCopilotStagingStore} from '../assistant/copilotStagingStore';
import {useDAWStore} from '../store/useDAWStore';

type ProjectPersistenceWatchOptions = {
  savedFingerprintRef: MutableRefObject<string | null>;
  setIsDirty: (dirty: boolean) => void;
  writeCurrentAutosave: () => void;
};

export function useProjectPersistenceWatch({
  savedFingerprintRef,
  setIsDirty,
  writeCurrentAutosave,
}: ProjectPersistenceWatchOptions): void {
  useEffect(() => {
    const updateDirtyState = () => {
      const saved = savedFingerprintRef.current;
      const dirty =
        saved !== null &&
        snapshotFingerprint(captureProjectSnapshot()) !== saved;
      setIsDirty(dirty);
      // Don't autosave a Copilot preview that hasn't been accepted yet. The staged
      // edit is already live in the store, and persisting it before Accept would
      // turn a preview into a saved project change.
      if (dirty && !isCopilotStagePending()) {
        writeCurrentAutosave();
      }
    };

    updateDirtyState();
    const unsubscribeStore = useDAWStore.subscribe((nextState, previousState) => {
      if (projectSnapshotSourcesChanged(previousState, nextState)) {
        updateDirtyState();
      }
    });
    const unsubscribeStaging = useCopilotStagingStore.subscribe((nextState, previousState) => {
      if (previousState.stagePending && !nextState.stagePending) {
        updateDirtyState();
      }
    });
    const unsubscribeChats = useCopilotChatHistoryStore.subscribe((nextState, previousState) => {
      if (
        previousState.sessions !== nextState.sessions ||
        previousState.activeSessionId !== nextState.activeSessionId
      ) {
        updateDirtyState();
      }
    });
    return () => {
      unsubscribeStore();
      unsubscribeStaging();
      unsubscribeChats();
    };
  }, [savedFingerprintRef, setIsDirty, writeCurrentAutosave]);
}
