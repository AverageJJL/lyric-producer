import {useCallback, useState} from 'react';

export type RightPanelId = 'samples' | 'browser' | 'audio' | 'lyrics' | 'copilot';

export const RIGHT_DOCK_MIN_WIDTH = 280;
export const RIGHT_DOCK_MAX_WIDTH = 560;
export const RIGHT_DOCK_DEFAULT_WIDTH = 340;

export function useWorkspacePanels() {
  const [rightPanel, setRightPanel] = useState<RightPanelId | null>(null);
  const [rightPanelWidth, setRightPanelWidth] = useState(RIGHT_DOCK_DEFAULT_WIDTH);
  const [isMixerOpen, setIsMixerOpen] = useState(false);
  const [isEditorOpen, setIsEditorOpen] = useState(true);
  const [areColoredSectionsHidden, setColoredSectionsHidden] = useState(false);

  const toggleRightPanel = useCallback((panel: RightPanelId) => {
    setRightPanel(current => (current === panel ? null : panel));
  }, []);

  const openRightPanel = useCallback((panel: RightPanelId) => {
    setRightPanel(panel);
  }, []);

  const toggleMixer = useCallback(() => {
    setIsMixerOpen(open => !open);
  }, []);

  const openEditor = useCallback(() => setIsEditorOpen(true), []);
  const closeEditor = useCallback(() => setIsEditorOpen(false), []);
  const toggleEditor = useCallback(() => setIsEditorOpen(open => !open), []);

  return {
    rightPanel,
    rightPanelWidth,
    isMixerOpen,
    isEditorOpen,
    areColoredSectionsHidden,
    setRightPanelWidth,
    setColoredSectionsHidden,
    toggleRightPanel,
    openRightPanel,
    toggleMixer,
    setMixerOpen: setIsMixerOpen,
    openEditor,
    closeEditor,
    toggleEditor,
    closeMixer: () => setIsMixerOpen(false),
  };
}
