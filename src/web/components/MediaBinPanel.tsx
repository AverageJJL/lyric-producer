import React, {useMemo} from 'react';

import {
  collectMediaSourceInventory,
  mediaSourceClipCountLabel,
  mediaSourceLocationLabel,
  mediaSourceStatusLabel,
  type MediaSourceInventoryItem,
} from '../../arrangement/mediaSourceInventory';
import type {DAWBlock} from '../../store/useDAWStore';

type MediaBinPanelProps = {
  blocks: DAWBlock[];
  selectedBlockId: string | null;
  isRelinkingAudio: boolean;
  isImportingAudio: boolean;
  onSelectBlock: (blockId: string) => void;
  onRelinkAudio: (blockId: string) => void;
  onRevealAudio: (path?: string) => void;
  onRenameSource: (blockId: string, name: string) => void;
  onDuplicateSource: (blockId: string) => void;
  onConsolidateProjectMedia: () => void;
  onRecoverOfflineMedia: () => void;
  isConsolidatingMedia: boolean;
  isRecoveringOfflineMedia: boolean;
  consolidationMessage: string | null;
  offlineRecoveryMessage: string | null;
};

function sourceDetail(item: MediaSourceInventoryItem): string {
  return [
    mediaSourceClipCountLabel(item.clipCount),
    mediaSourceLocationLabel(item),
  ].join(' - ');
}

function sampleRateLabel(item: MediaSourceInventoryItem): string | null {
  return typeof item.sampleRate === 'number' && item.sampleRate > 0
    ? `${Math.round(item.sampleRate)} Hz`
    : null;
}

function actionBlock(
  item: MediaSourceInventoryItem,
  selectedBlockId: string | null,
): DAWBlock {
  return item.blocks.find(block => block.id === selectedBlockId) ?? item.blocks[0]!;
}

export function MediaBinPanel({
  blocks,
  selectedBlockId,
  isRelinkingAudio,
  isImportingAudio,
  onSelectBlock,
  onRelinkAudio,
  onRevealAudio,
  onRenameSource,
  onDuplicateSource,
  onConsolidateProjectMedia,
  onRecoverOfflineMedia,
  isConsolidatingMedia,
  isRecoveringOfflineMedia,
  consolidationMessage,
  offlineRecoveryMessage,
}: MediaBinPanelProps) {
  const mediaSources = useMemo(() => collectMediaSourceInventory(blocks), [blocks]);
  const hasMissingMedia = mediaSources.some(item => item.status === 'missing');

  return (
    <section className="inspector-card media-bin-panel" aria-label="Media bin">
      <div className="inspector-title">
        <span>Media Bin</span>
        <strong>{mediaSources.length}</strong>
      </div>
      <div className="media-bin-toolbar">
        <button
          type="button"
          className="media-bin-consolidate"
          onClick={onConsolidateProjectMedia}
          disabled={isConsolidatingMedia || isRecoveringOfflineMedia || isImportingAudio || isRelinkingAudio}>
          {isConsolidatingMedia ? 'Consolidating' : 'Consolidate'}
        </button>
        <button
          type="button"
          className="media-bin-consolidate"
          onClick={onRecoverOfflineMedia}
          disabled={
            !hasMissingMedia ||
            isRecoveringOfflineMedia ||
            isConsolidatingMedia ||
            isImportingAudio ||
            isRelinkingAudio
          }>
          {isRecoveringOfflineMedia ? 'Recovering' : 'Recover Offline'}
        </button>
      </div>
      {consolidationMessage ? (
        <p className="media-bin-status">{consolidationMessage}</p>
      ) : null}
      {offlineRecoveryMessage ? (
        <p className="media-bin-status">{offlineRecoveryMessage}</p>
      ) : null}
      {mediaSources.length === 0 ? (
        <p className="media-bin-empty">No audio media yet.</p>
      ) : (
        <div className="media-bin-list">
          {mediaSources.map(item => {
            const status = mediaSourceStatusLabel(item.status);
            const selectedInSource = item.blocks.some(block => block.id === selectedBlockId);
            const block = actionBlock(item, selectedBlockId);
            const canReveal = Boolean(item.revealPath);
            return (
              <div
                key={item.sourceKey}
                className={`media-bin-row ${selectedInSource ? 'selected' : ''}`}
                data-status={item.status}>
                <button
                  type="button"
                  className="media-bin-select"
                  aria-pressed={selectedInSource}
                  aria-label={`Select media ${item.name}`}
                  onClick={() => onSelectBlock(block.id)}>
                  <span>{item.name}</span>
                  <small>{sourceDetail(item)}</small>
                  <small>{item.sourcePath}</small>
                </button>
                <div className="media-bin-meta">
                  <span>{status}</span>
                  {sampleRateLabel(item) ? <small>{sampleRateLabel(item)}</small> : null}
                </div>
                <div className="media-bin-actions">
                  <button
                    type="button"
                    onClick={() => onRevealAudio(item.revealPath)}
                    disabled={!canReveal}
                    aria-label={`Reveal media ${item.name}`}>
                    Reveal
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const nextName = window.prompt('Rename media source', item.name);
                      if (nextName) {
                        onRenameSource(block.id, nextName);
                      }
                    }}
                    aria-label={`Rename media ${item.name}`}>
                    Rename
                  </button>
                  <button
                    type="button"
                    onClick={() => onDuplicateSource(block.id)}
                    disabled={isImportingAudio || block.isMissingMedia}
                    aria-label={`Duplicate media ${item.name}`}>
                    Duplicate
                  </button>
                  {item.status === 'missing' ? (
                    <button
                      type="button"
                      onClick={() => onRelinkAudio(block.id)}
                      disabled={isRelinkingAudio || isImportingAudio}
                      aria-label={`Relink media ${item.name}`}>
                      Relink
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
