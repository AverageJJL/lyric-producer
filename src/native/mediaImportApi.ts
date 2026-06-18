export type AudioImportRequest = {
  path?: string;
};

export type AudioImportResponse =
  | {
      ok: true;
      originalPath: string;
      absolutePath: string;
      relativePath: string;
      name: string;
    }
  | {ok: false; error: string; canceled?: boolean};

export type AudioMediaReferenceRequest = {
  clipId: string;
  trackId: string;
  relativePath?: string;
  absolutePath?: string;
};

export type AudioMediaResolution = {
  clipId: string;
  exists: boolean;
  relativePath?: string;
  absolutePath?: string;
};

export type AudioMediaResolveResponse =
  | {ok: true; resolved: AudioMediaResolution[]}
  | {ok: false; error: string};

export type AudioMediaRevealResponse =
  | {ok: true}
  | {ok: false; error: string};

export type OfflineAudioSourceRequest = {
  sourceKey: string;
  sourcePath: string;
  name: string;
};

export type OfflineAudioRecovery = {
  sourceKey: string;
  sourcePath?: string;
  matchedPath: string;
  originalPath: string;
  absolutePath: string;
  relativePath: string;
  name: string;
};

export type OfflineAudioRecoveryResponse =
  | {
      ok: true;
      folderPath: string;
      recovered: OfflineAudioRecovery[];
      missing: Array<{sourceKey: string; sourcePath?: string; name?: string}>;
    }
  | {ok: false; error: string; canceled?: boolean};

export type SampleProviderRecord = {
  id: string;
  label: string;
};

export type SampleProviderEntry = {
  id: string;
  providerId: string;
  providerLabel: string;
  packId?: string;
  packLabel?: string;
  family?: string;
  sourceName?: string;
  license?: string;
  name: string;
  absolutePath: string;
  fileBytes: number;
  modifiedAt: string;
  tags: string[];
};

export type SampleProviderBrowseRequest = {
  providerId?: string;
  query?: string;
  family?: string;
  tags?: string[];
  limit?: number;
};

export type SampleProviderBrowseResponse =
  | {ok: true; providers: SampleProviderRecord[]; samples: SampleProviderEntry[]}
  | {ok: false; error: string};

export type SampleLibraryPackStatus = {
  id: string;
  family: string;
  displayName: string;
  license: string;
  licenseUrl?: string;
  description?: string;
  sourceName?: string;
  sourceUrl?: string;
  fileCount: number;
  totalBytes: number;
  installedBytes: number;
  state: 'missing' | 'partial' | 'installed' | 'downloading' | 'error';
  error?: string;
};

export type SampleLibraryStatus = {
  ok: true;
  libraryId: string;
  displayName: string;
  license: string;
  state: 'missing' | 'partial' | 'installed' | 'downloading' | 'error';
  packs: SampleLibraryPackStatus[];
  installedBytes: number;
  totalBytes: number;
  fileCount: number;
  activePackId?: string;
  error?: string;
};

export type SampleLibraryResponse = SampleLibraryStatus | {ok: false; error: string};
export type SampleLibraryRequest = {packId?: string};

export type MidiImportResponse =
  | {ok: true; originalPath: string; base64: string; name: string}
  | {ok: false; error: string; canceled?: boolean};

export type MediaImportBridge = {
  pathForFile?: (file: File) => string | null;
  importAudio: (request?: AudioImportRequest) => Promise<AudioImportResponse>;
  importMidi?: (request?: AudioImportRequest) => Promise<MidiImportResponse>;
  relinkAudio?: (request?: AudioImportRequest) => Promise<AudioImportResponse>;
  duplicateAudio?: (request: AudioImportRequest) => Promise<AudioImportResponse>;
  recoverOfflineAudio?: (request: {
    folderPath?: string;
    sources: OfflineAudioSourceRequest[];
  }) => Promise<OfflineAudioRecoveryResponse>;
  prepareAudioRender?: (request?: {defaultPath?: string}) => Promise<AudioImportResponse>;
  resolveAudioMedia?: (request: {
    references: AudioMediaReferenceRequest[];
  }) => Promise<AudioMediaResolveResponse>;
  revealAudioMedia?: (request: {path?: string}) => Promise<AudioMediaRevealResponse>;
  browseSamples?: (
    request?: SampleProviderBrowseRequest,
  ) => Promise<SampleProviderBrowseResponse>;
  sampleLibraryStatus?: () => Promise<SampleLibraryResponse>;
  downloadSampleLibrary?: (request?: SampleLibraryRequest) => Promise<SampleLibraryResponse>;
  deleteSampleLibraryPack?: (request: {packId: string}) => Promise<SampleLibraryResponse>;
  cancelSampleLibraryDownload?: (request?: SampleLibraryRequest) => Promise<SampleLibraryResponse>;
};

declare global {
  interface Window {
    mediaImport?: MediaImportBridge;
  }
}

export function getMediaImportBridge(): MediaImportBridge | null {
  return globalThis.window?.mediaImport ?? null;
}
