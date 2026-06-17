import React from 'react';

import {GUIDE_TARGET_IDS} from '../../assistant/copilotGuide';

type TransportMetronomeButtonProps = {
  isEnabled: boolean;
  onToggle: () => void;
};

export function TransportMetronomeButton({
  isEnabled,
  onToggle,
}: TransportMetronomeButtonProps) {
  return (
    <button
      type="button"
      className={`metronome-toggle ${isEnabled ? 'active' : ''}`}
      aria-label="Metronome"
      aria-pressed={isEnabled}
      data-guide-target={GUIDE_TARGET_IDS['click-button']}
      onClick={onToggle}>
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        width="24"
        height="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round">
        <path d="M 7 21 L 17 21 Q 19.5 21 19.2 18.2 L 13.2 4.8 Q 12 2.5 10.8 4.8 L 4.8 18.2 Q 4.5 21 7 21 Z" />
        <line x1="6.2" y1="15" x2="17.8" y2="15" />
        <line x1="12" y1="7.5" x2="12" y2="11.5" />
        <line x1="12" y1="18.5" x2="6.5" y2="7.5" />
        <line x1="7.75" y1="13.75" x2="10.75" y2="12.25" />
      </svg>
    </button>
  );
}
