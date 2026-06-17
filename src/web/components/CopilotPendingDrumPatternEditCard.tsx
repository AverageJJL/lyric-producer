import React from 'react';

import {
  describeCopilotDrumPatternEdit,
  type CopilotDrumPatternEdit,
} from '../../assistant/copilotDrumPatternOptions';

type PendingDrumPatternEdit = {
  id: string;
  edits: CopilotDrumPatternEdit[];
  error?: string;
};

type CopilotPendingDrumPatternEditCardProps = {
  pendingDrumPatternEdit: PendingDrumPatternEdit;
  onApply: () => void;
  onCancel: () => void;
};

export function CopilotPendingDrumPatternEditCard({
  pendingDrumPatternEdit,
  onApply,
  onCancel,
}: CopilotPendingDrumPatternEditCardProps) {
  return (
    <section className="copilot-midi-edit-card" aria-label="Pending drum pattern edit">
      <div className="copilot-midi-edit-header">
        <span>Pending drum edit</span>
        <span>{pendingDrumPatternEdit.edits.length}</span>
      </div>
      <ul>
        {pendingDrumPatternEdit.edits.map((edit, index) => (
          <li key={`${pendingDrumPatternEdit.id}-${index}`}>{describeCopilotDrumPatternEdit(edit)}</li>
        ))}
      </ul>
      {pendingDrumPatternEdit.error ? <p className="copilot-midi-edit-error">{pendingDrumPatternEdit.error}</p> : null}
      <div className="copilot-midi-edit-actions">
        <button type="button" onClick={onApply}>Apply</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
