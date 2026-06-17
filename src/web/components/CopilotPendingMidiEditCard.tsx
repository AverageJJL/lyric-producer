import React from 'react';

import {
  describeCopilotMidiBlockEdit,
  type CopilotMidiBlockEdit,
} from '../../assistant/copilotMidiBlockEdits';

type PendingMidiEdit = {
  id: string;
  edits: CopilotMidiBlockEdit[];
  error?: string;
};

type CopilotPendingMidiEditCardProps = {
  pendingMidiEdit: PendingMidiEdit;
  onApply: () => void;
  onCancel: () => void;
};

export function CopilotPendingMidiEditCard({
  pendingMidiEdit,
  onApply,
  onCancel,
}: CopilotPendingMidiEditCardProps) {
  return (
    <section className="copilot-midi-edit-card" aria-label="Pending MIDI block edit">
      <div className="copilot-midi-edit-header">
        <span>Pending MIDI edit</span>
        <span>{pendingMidiEdit.edits.length}</span>
      </div>
      <ul>
        {pendingMidiEdit.edits.map((edit, index) => (
          <li key={`${pendingMidiEdit.id}-${index}`}>{describeCopilotMidiBlockEdit(edit)}</li>
        ))}
      </ul>
      {pendingMidiEdit.error ? <p className="copilot-midi-edit-error">{pendingMidiEdit.error}</p> : null}
      <div className="copilot-midi-edit-actions">
        <button type="button" onClick={onApply}>Apply</button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}
