import {useCallback, useState} from 'react';

import {
  consolidateProjectMediaSources,
  projectMediaConsolidationMessage,
} from '../arrangement/projectMediaConsolidation';
import {
  offlineMediaRecoveryMessage,
  recoverOfflineMediaSources,
} from '../arrangement/offlineMediaRecovery';
import {getMediaImportBridge} from '../native/mediaImportApi';

export type MediaConsolidationControls = {
  isConsolidatingMedia: boolean;
  isRecoveringOfflineMedia: boolean;
  mediaConsolidationMessage: string | null;
  offlineMediaRecoveryMessage: string | null;
  consolidateProjectMedia: () => Promise<void>;
  recoverOfflineMedia: () => Promise<void>;
};

export function useMediaConsolidation(): MediaConsolidationControls {
  const [isConsolidatingMedia, setIsConsolidatingMedia] = useState(false);
  const [isRecoveringOfflineMedia, setIsRecoveringOfflineMedia] = useState(false);
  const [mediaConsolidationMessage, setMediaConsolidationMessage] = useState<string | null>(null);
  const [offlineRecoveryMessage, setOfflineRecoveryMessage] = useState<string | null>(null);

  const consolidateProjectMedia = useCallback(async () => {
    const bridge = getMediaImportBridge();

    setIsConsolidatingMedia(true);
    setMediaConsolidationMessage(null);
    try {
      const result = await consolidateProjectMediaSources(bridge);
      setMediaConsolidationMessage(
        result.ok ? projectMediaConsolidationMessage(result) : result.error,
      );
    } finally {
      setIsConsolidatingMedia(false);
    }
  }, []);

  const recoverOfflineMedia = useCallback(async () => {
    const bridge = getMediaImportBridge();

    setIsRecoveringOfflineMedia(true);
    setOfflineRecoveryMessage(null);
    try {
      const result = await recoverOfflineMediaSources(bridge);
      if (!result.ok) {
        if (!result.canceled) {
          setOfflineRecoveryMessage(result.error);
        }
        return;
      }
      const message = offlineMediaRecoveryMessage(result);
      setOfflineRecoveryMessage(message || null);
    } finally {
      setIsRecoveringOfflineMedia(false);
    }
  }, []);

  return {
    isConsolidatingMedia,
    isRecoveringOfflineMedia,
    mediaConsolidationMessage,
    offlineMediaRecoveryMessage: offlineRecoveryMessage,
    consolidateProjectMedia,
    recoverOfflineMedia,
  };
}
