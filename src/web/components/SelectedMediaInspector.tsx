import React from 'react';

import type {DAWBlock} from '../../store/useDAWStore';

type SelectedMediaInspectorProps = {
  block: DAWBlock | null;
  isRelinkingAudio: boolean;
  isImportingAudio: boolean;
  onRelinkAudio: (blockId: string) => void;
};

function hertzLabel(value: number | undefined): string | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? `${Math.round(value)} Hz`
    : null;
}

export function SelectedMediaInspector({
  block,
  isRelinkingAudio,
  isImportingAudio,
  onRelinkAudio,
}: SelectedMediaInspectorProps) {
  if (!block || block.type !== 'audio') {
    return null;
  }

  const canRelinkAudio = Boolean(block.isMissingMedia);
  const sourceSampleRate = hertzLabel(block.sourceSampleRate);
  const hasMediaInspector = Boolean(
    block.audioFilePath || block.mediaValidationWarning || canRelinkAudio,
  );
  if (!hasMediaInspector) {
    return null;
  }

  const mediaStatus = canRelinkAudio
    ? 'Missing'
    : block.mediaValidationWarning
      ? 'Warning'
      : 'Linked';

  return (
    <section className="inspector-card media-relink-panel" aria-label="Media inspector">
      <div className="inspector-title">
        <span>Media</span>
        <strong>{mediaStatus}</strong>
      </div>
      <div className="media-relink-row">
        <span>{block.name}</span>
        {canRelinkAudio ? (
          <button
            type="button"
            className="media-relink-button"
            onClick={() => onRelinkAudio(block.id)}
            disabled={isRelinkingAudio || isImportingAudio}>
            {isRelinkingAudio ? 'Relinking' : 'Relink Audio'}
          </button>
        ) : null}
      </div>
      {block.mediaValidationWarning ? (
        <p className="media-validation-warning">{block.mediaValidationWarning}</p>
      ) : null}
      {sourceSampleRate ? (
        <dl>
          <div>
            <dt>Sample Rate</dt>
            <dd>{sourceSampleRate}</dd>
          </div>
          <div>
            <dt>Channels</dt>
            <dd>{block.sourceChannelCount ?? 'Unknown'}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}
