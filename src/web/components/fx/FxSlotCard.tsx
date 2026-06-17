import React from 'react';

import type {FxSlotId} from '../../../native/fxContract';

type FxSlotCardProps = {
  slotId: FxSlotId;
  title: string;
  summary: string;
  enabled: boolean;
  isActive: boolean;
  hasAiTarget?: boolean;
  onSelect: () => void;
  onToggle: (enabled: boolean) => void;
};

export function FxSlotCard({
  title,
  summary,
  enabled,
  isActive,
  hasAiTarget = false,
  onSelect,
  onToggle,
}: FxSlotCardProps) {
  return (
    <div
      className={`fx-slot-card ${isActive ? 'active' : ''} ${enabled ? 'enabled' : ''} ${hasAiTarget ? 'ai-targeted' : ''}`}
      data-ai-targeted={hasAiTarget ? 'true' : undefined}>
      <button type="button" className="fx-slot-select" onClick={onSelect}>
        <span className="fx-slot-title">{title}</span>
        <span className="fx-slot-summary">{summary}</span>
      </button>
      <button
        type="button"
        className={`fx-slot-power ${enabled ? 'on' : ''}`}
        aria-pressed={enabled}
        aria-label={`${title} ${enabled ? 'on' : 'off'}`}
        onClick={event => {
          event.stopPropagation();
          onToggle(!enabled);
        }}>
        {enabled ? 'On' : 'Off'}
      </button>
    </div>
  );
}
