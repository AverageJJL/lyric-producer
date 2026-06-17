import React from 'react';

import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';
import type {RightPanelId} from '../../hooks/useWorkspacePanels';
import {
  AudioSpeakerIcon,
  BrowserFolderIcon,
  CopilotSparkIcon,
  MixerSlidersIcon,
  SamplesWaveformIcon,
} from './icons/WorkspaceIcons';

type WorkspaceNavButtonsProps = {
  rightPanel: RightPanelId | null;
  isMixerOpen: boolean;
  onToggleRightPanel: (panel: RightPanelId) => void;
  onToggleMixer: () => void;
};

export function WorkspaceNavButtons({
  rightPanel,
  isMixerOpen,
  onToggleRightPanel,
  onToggleMixer,
}: WorkspaceNavButtonsProps) {
  return (
    <div className="workspace-nav-buttons">
      <div className="workspace-nav-group" role="group" aria-label="Side panels">
        <button
          type="button"
          className={`workspace-nav-button ${rightPanel === 'samples' ? 'active' : ''}`}
          aria-label="Samples"
          aria-pressed={rightPanel === 'samples'}
          data-guide-target={GUIDE_TARGET_IDS['samples-button']}
          onClick={() => onToggleRightPanel('samples')}>
          <SamplesWaveformIcon className="workspace-nav-icon" />
        </button>
        <button
          type="button"
          className={`workspace-nav-button ${rightPanel === 'browser' ? 'active' : ''}`}
          aria-label="Browser"
          aria-pressed={rightPanel === 'browser'}
          data-guide-target={GUIDE_TARGET_IDS['browser-button']}
          onClick={() => onToggleRightPanel('browser')}>
          <BrowserFolderIcon className="workspace-nav-icon" />
        </button>
        <button
          type="button"
          className={`workspace-nav-button ${rightPanel === 'audio' ? 'active' : ''}`}
          aria-label="Audio settings"
          aria-pressed={rightPanel === 'audio'}
          data-guide-target={GUIDE_TARGET_IDS['audio-settings-button']}
          onClick={() => onToggleRightPanel('audio')}>
          <AudioSpeakerIcon className="workspace-nav-icon" />
        </button>
        <button
          type="button"
          className={`workspace-nav-button ${isMixerOpen ? 'active' : ''}`}
          aria-label="Mixer"
          aria-pressed={isMixerOpen}
          data-guide-target={GUIDE_TARGET_IDS['mixer-button']}
          onClick={onToggleMixer}>
          <MixerSlidersIcon className="workspace-nav-icon" />
        </button>
      </div>
      <div className="workspace-nav-group" role="group" aria-label="Copilot">
        <button
          type="button"
          className={`workspace-nav-button ${rightPanel === 'copilot' ? 'active' : ''}`}
          aria-label="Copilot"
          aria-pressed={rightPanel === 'copilot'}
          data-guide-target={GUIDE_TARGET_IDS['copilot-button']}
          onClick={() => onToggleRightPanel('copilot')}>
          <CopilotSparkIcon className="workspace-nav-icon" />
        </button>
      </div>
    </div>
  );
}
