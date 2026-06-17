import React from 'react';

import type {SampleLibraryStatus, SampleProviderEntry} from '../../native/mediaImportApi';

type SampleProviderPanelProps = {
  samples: SampleProviderEntry[];
  query: string;
  familyFilter: string;
  isBrowsing: boolean;
  libraryStatus: SampleLibraryStatus | null;
  isDownloadingLibrary: boolean;
  isImportingAudio: boolean;
  errorMessage: string | null;
  onSearch: (query: string) => void;
  onSelectFamily: (family: string) => void;
  onRefresh: () => void;
  onDownloadLibrary: (packId?: string) => void;
  onDeleteLibraryPack: (packId: string) => void;
  onCancelLibraryDownload: (packId?: string) => void;
  onImportSample: (absolutePath: string) => void;
};

const FAMILY_FILTERS = [
  ['all', 'All'],
  ['drums', 'Drums'],
  ['bass-guitar', 'Bass/Guitar'],
  ['keys', 'Keys'],
  ['orchestra', 'Orchestra'],
  ['percussion-fx', 'Perc/FX'],
] as const;

function fileSizeLabel(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 KB';
  }
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export function SampleProviderPanel({
  samples,
  query,
  familyFilter,
  isBrowsing,
  libraryStatus,
  isDownloadingLibrary,
  isImportingAudio,
  errorMessage,
  onSearch,
  onSelectFamily,
  onRefresh,
  onDownloadLibrary,
  onDeleteLibraryPack,
  onCancelLibraryDownload,
  onImportSample,
}: SampleProviderPanelProps) {
  const libraryDownloading = isDownloadingLibrary || libraryStatus?.state === 'downloading';
  const downloadablePacks = libraryStatus?.packs.filter(pack => pack.fileCount > 0) ?? [];
  const allInstalled = downloadablePacks.length > 0 &&
    downloadablePacks.every(pack => pack.state === 'installed');

  return (
    <section className="inspector-card sample-provider-panel" aria-label="Sample providers">
      <div className="inspector-title">
        <span>Samples</span>
        <strong>{isBrowsing ? 'Scanning' : samples.length}</strong>
      </div>
      {libraryStatus ? (
        <div className="sample-library-stack">
          <div className="sample-library-card">
            <div className="sample-provider-main">
              <span>{libraryStatus.displayName}</span>
              <small>{libraryStatus.license}</small>
            </div>
            <div className="sample-library-meta">
              <span>{libraryStatus.installedBytes === libraryStatus.totalBytes ? 'Installed' : libraryStatus.state}</span>
              <small>{fileSizeLabel(libraryStatus.totalBytes)}</small>
            </div>
            <button
              type="button"
              onClick={() => libraryDownloading ? onCancelLibraryDownload() : onDownloadLibrary()}
              disabled={allInstalled || downloadablePacks.length === 0}
              aria-label={`Download ${libraryStatus.displayName}`}>
              {libraryDownloading ? 'Cancel' : allInstalled ? 'Ready' : 'Download All'}
            </button>
          </div>
          <div className="sample-library-pack-list">
            {libraryStatus.packs.map(pack => {
              const progress = pack.totalBytes > 0
                ? Math.round((pack.installedBytes / pack.totalBytes) * 100)
                : 0;
              const packDownloading = pack.state === 'downloading';
              return (
                <div key={pack.id} className="sample-library-pack">
                  <div className="sample-provider-main">
                    <span>{pack.displayName}</span>
                    <small>{pack.fileCount} samples · {pack.sourceName ?? pack.family}</small>
                  </div>
                  <div className="sample-library-meta">
                    <span>{pack.state === 'installed' ? 'Installed' : `${progress}%`}</span>
                    <small>{fileSizeLabel(pack.totalBytes)}</small>
                  </div>
                  {pack.state === 'installed' ? (
                    <button type="button" onClick={() => onDeleteLibraryPack(pack.id)}>
                      Delete
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => packDownloading ? onCancelLibraryDownload(pack.id) : onDownloadLibrary(pack.id)}
                      disabled={pack.fileCount === 0}
                      aria-label={`Download ${pack.displayName}`}>
                      {packDownloading ? 'Cancel' : 'Download'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="sample-family-filters" aria-label="Sample family filters">
        {FAMILY_FILTERS.map(([family, label]) => (
          <button
            key={family}
            type="button"
            className={familyFilter === family ? 'active' : ''}
            onClick={() => onSelectFamily(family)}>
            {label}
          </button>
        ))}
      </div>
      <form
        className="sample-provider-search"
        onSubmit={event => {
          event.preventDefault();
          onRefresh();
        }}>
        <input
          value={query}
          placeholder="Search samples"
          onChange={event => onSearch(event.currentTarget.value)}
          aria-label="Search samples"
        />
        <button type="submit" disabled={isBrowsing}>
          Refresh
        </button>
      </form>
      {errorMessage ? <p className="sample-provider-error">{errorMessage}</p> : null}
      {samples.length === 0 ? (
        <p className="sample-provider-empty">No provider samples.</p>
      ) : (
        <div className="sample-provider-list">
          {samples.map(sample => (
            <div key={sample.id} className="sample-provider-row">
              <div className="sample-provider-main">
                <span>{sample.name}</span>
                <small>{sample.packLabel ?? sample.providerLabel}</small>
              </div>
              <div className="sample-provider-meta">
                <span>{fileSizeLabel(sample.fileBytes)}</span>
                <small>{sample.family ?? sample.tags.slice(0, 3).join(' / ')}</small>
              </div>
              <button
                type="button"
                onClick={() => onImportSample(sample.absolutePath)}
                disabled={isImportingAudio}
                aria-label={`Import sample ${sample.name}`}>
                Import
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
