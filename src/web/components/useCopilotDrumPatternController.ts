import {useCallback, useEffect, useState} from 'react';

import {
  importCopilotDrumPatternOption,
  type CopilotDrumPatternOption,
} from '../../assistant/copilotDrumPatternOptions';
import {
  activeCopilotDrumPreviewOptionId,
  startCopilotDrumPatternPreview,
  stopCopilotDrumPatternPreview,
} from '../../assistant/copilotDrumPatternPreview';
import {useDAWStore} from '../../store/useDAWStore';

type OptionStatus = Record<string, {status?: string; error?: string}>;

export function useCopilotDrumPatternController(scheduleFocusInput: () => void) {
  const [playingOptionId, setPlayingOptionId] = useState<string | null>(activeCopilotDrumPreviewOptionId());
  const [optionStatus, setOptionStatus] = useState<OptionStatus>({});
  const isPlayingTransport = useDAWStore(state => state.isPlaying);

  useEffect(() => {
    if (!isPlayingTransport) {
      return;
    }
    stopCopilotDrumPatternPreview();
    setPlayingOptionId(null);
  }, [isPlayingTransport]);

  useEffect(() => {
    const onImported = (event: Event) => {
      const detail = (event as CustomEvent<{optionId?: string; message?: string; error?: string}>).detail;
      if (!detail?.optionId) {
        return;
      }
      const optionId = detail.optionId;
      setOptionStatus(current => ({
        ...current,
        [optionId]: detail.error
          ? {error: detail.error}
          : {status: detail.message ?? 'Imported to timeline.'},
      }));
    };
    window.addEventListener('copilot-drum-pattern-imported', onImported);
    return () => {
      window.removeEventListener('copilot-drum-pattern-imported', onImported);
      stopCopilotDrumPatternPreview();
    };
  }, []);

  const playDrumPattern = useCallback((option: CopilotDrumPatternOption) => {
    const result = startCopilotDrumPatternPreview(option);
    if (!result.ok) {
      setOptionStatus(current => ({...current, [option.id]: {error: result.error}}));
      return;
    }
    setPlayingOptionId(option.id);
    setOptionStatus(current => ({...current, [option.id]: {status: 'Previewing...'}}));
  }, []);

  const stopDrumPattern = useCallback(() => {
    stopCopilotDrumPatternPreview();
    setPlayingOptionId(null);
  }, []);

  const importDrumPattern = useCallback((option: CopilotDrumPatternOption) => {
    stopDrumPattern();
    const result = importCopilotDrumPatternOption(option);
    setOptionStatus(current => ({
      ...current,
      [option.id]: result.ok ? {status: result.message} : {error: result.error},
    }));
    scheduleFocusInput();
  }, [scheduleFocusInput, stopDrumPattern]);

  return {
    playingOptionId,
    optionStatus,
    playDrumPattern,
    stopDrumPattern,
    importDrumPattern,
  };
}
