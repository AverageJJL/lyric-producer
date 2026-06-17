import {useCallback, useEffect, useState} from 'react';

import {
  getMediaImportBridge,
  type SampleLibraryStatus,
  type SampleProviderEntry,
  type SampleProviderRecord,
} from '../native/mediaImportApi';

export type SampleProviderBrowserState = {
  providers: SampleProviderRecord[];
  samples: SampleProviderEntry[];
  query: string;
  familyFilter: string;
  isBrowsing: boolean;
  libraryStatus: SampleLibraryStatus | null;
  isDownloadingLibrary: boolean;
  errorMessage: string | null;
  search: (query: string) => void;
  selectFamily: (family: string) => void;
  refresh: () => void;
  downloadLibrary: (packId?: string) => void;
  deleteLibraryPack: (packId: string) => void;
  cancelLibraryDownload: (packId?: string) => void;
};

export function useSampleProviderBrowser(): SampleProviderBrowserState {
  const [providers, setProviders] = useState<SampleProviderRecord[]>([]);
  const [samples, setSamples] = useState<SampleProviderEntry[]>([]);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState('all');
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [libraryStatus, setLibraryStatus] = useState<SampleLibraryStatus | null>(null);
  const [isDownloadingLibrary, setIsDownloadingLibrary] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refreshLibraryStatus = useCallback(async () => {
    const bridge = getMediaImportBridge();
    if (!bridge?.sampleLibraryStatus) {
      return;
    }
    const response = await bridge.sampleLibraryStatus();
    if (!response.ok) {
      setErrorMessage(response.error);
      return;
    }
    setLibraryStatus(response);
  }, []);

  const browse = useCallback(async (nextQuery: string, nextFamily: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.browseSamples) {
      return;
    }

    setIsBrowsing(true);
    setErrorMessage(null);
    try {
      const response = await bridge.browseSamples({
        providerId: 'royalty_free_library',
        query: nextQuery,
        family: nextFamily === 'all' ? undefined : nextFamily,
        limit: 24,
      });
      if (!response.ok) {
        setErrorMessage(response.error);
        setSamples([]);
        return;
      }
      setProviders(response.providers);
      setSamples(response.samples);
    } finally {
      setIsBrowsing(false);
    }
  }, []);

  const search = useCallback((nextQuery: string) => {
    setQuery(nextQuery);
    void browse(nextQuery, familyFilter);
  }, [browse, familyFilter]);

  const selectFamily = useCallback((nextFamily: string) => {
    setFamilyFilter(nextFamily);
    void browse(query, nextFamily);
  }, [browse, query]);

  const refresh = useCallback(() => {
    void browse(query, familyFilter);
  }, [browse, familyFilter, query]);

  const downloadLibrary = useCallback((packId?: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.downloadSampleLibrary) {
      return;
    }
    setIsDownloadingLibrary(true);
    setErrorMessage(null);
    setLibraryStatus(current => current ? {...current, state: 'downloading'} : current);
    void bridge.downloadSampleLibrary(packId ? {packId} : undefined).then(response => {
      if (!response.ok) {
        setErrorMessage(response.error);
        return;
      }
      setLibraryStatus(response);
      if (response.state === 'installed' || response.state === 'partial') {
        void browse(query, familyFilter);
      }
      if (response.error) {
        setErrorMessage(response.error);
      }
    }).finally(() => {
      setIsDownloadingLibrary(false);
    });
  }, [browse, familyFilter, query]);

  const deleteLibraryPack = useCallback((packId: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.deleteSampleLibraryPack) {
      return;
    }
    setErrorMessage(null);
    void bridge.deleteSampleLibraryPack({packId}).then(response => {
      if (!response.ok) {
        setErrorMessage(response.error);
        return;
      }
      setLibraryStatus(response);
      void browse(query, familyFilter);
    });
  }, [browse, familyFilter, query]);

  const cancelLibraryDownload = useCallback((packId?: string) => {
    const bridge = getMediaImportBridge();
    if (!bridge?.cancelSampleLibraryDownload) {
      return;
    }
    void bridge.cancelSampleLibraryDownload(packId ? {packId} : undefined).then(response => {
      if (response.ok) {
        setLibraryStatus(response);
        if (response.error) {
          setErrorMessage(response.error);
        }
      }
    });
  }, []);

  useEffect(() => {
    void refreshLibraryStatus();
    void browse('', 'all');
  }, [browse, refreshLibraryStatus]);

  useEffect(() => {
    if (libraryStatus?.state !== 'downloading' && !isDownloadingLibrary) {
      return undefined;
    }
    const interval = window.setInterval(() => {
      void refreshLibraryStatus();
    }, 300);
    return () => window.clearInterval(interval);
  }, [isDownloadingLibrary, libraryStatus?.state, refreshLibraryStatus]);

  return {
    providers,
    samples,
    query,
    familyFilter,
    isBrowsing,
    libraryStatus,
    isDownloadingLibrary,
    errorMessage,
    search,
    selectFamily,
    refresh,
    downloadLibrary,
    deleteLibraryPack,
    cancelLibraryDownload,
  };
}
