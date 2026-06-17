import {useCallback, useEffect, useState} from 'react';

import {
  importCopilotMidiOption,
  type CopilotMidiOption,
} from '../../assistant/copilotMidiOptions';
import {
  activeCopilotMidiPreviewOptionId,
  startCopilotMidiOptionPreview,
  stopCopilotMidiOptionPreview,
} from '../../assistant/copilotMidiPreview';
import {useDAWStore} from '../../store/useDAWStore';

type OptionStatus = Record<string, {status?: string; error?: string}>;

export function useCopilotMidiOptionController(scheduleFocusInput: () => void) {
  const [playingOptionId, setPlayingOptionId] = useState<string | null>(activeCopilotMidiPreviewOptionId());
  const [optionStatus, setOptionStatus] = useState<OptionStatus>({});
  const isPlayingTransport = useDAWStore(state => state.isPlaying);

  useEffect(() => {
    if (!isPlayingTransport) {
      return;
    }
    stopCopilotMidiOptionPreview();
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
    window.addEventListener('copilot-midi-option-imported', onImported);
    return () => {
      window.removeEventListener('copilot-midi-option-imported', onImported);
      stopCopilotMidiOptionPreview();
    };
  }, []);

  const playMidiOption = useCallback((option: CopilotMidiOption) => {
    const result = startCopilotMidiOptionPreview(option);
    if (!result.ok) {
      setOptionStatus(current => ({...current, [option.id]: {error: result.error}}));
      return;
    }
    setPlayingOptionId(option.id);
    setOptionStatus(current => ({...current, [option.id]: {status: 'Previewing...'}}));
  }, []);

  const stopMidiOption = useCallback(() => {
    stopCopilotMidiOptionPreview();
    setPlayingOptionId(null);
  }, []);

  const importMidiOption = useCallback((option: CopilotMidiOption) => {
    stopMidiOption();
    const result = importCopilotMidiOption(option);
    setOptionStatus(current => ({
      ...current,
      [option.id]: result.ok ? {status: result.message} : {error: result.error},
    }));
    scheduleFocusInput();
  }, [scheduleFocusInput, stopMidiOption]);

  return {
    playingOptionId,
    optionStatus,
    playMidiOption,
    stopMidiOption,
    importMidiOption,
  };
}
