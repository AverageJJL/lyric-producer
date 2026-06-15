export type SampleLibraryFamily =
  | 'drums'
  | 'bass-guitar'
  | 'keys'
  | 'orchestra'
  | 'percussion-fx';

export type SampleLibraryState =
  | 'missing'
  | 'partial'
  | 'installed'
  | 'downloading'
  | 'error';

export type SampleLibraryManifestFile = {
  packId: string;
  family: SampleLibraryFamily;
  relativePath: string;
  url: string;
  bytes: number;
  sha256: string;
  tags: string[];
  displayName: string;
  sourceName: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
};

export type SampleLibraryPackManifest = {
  packId: string;
  family: SampleLibraryFamily;
  displayName: string;
  license: string;
  licenseUrl?: string;
  description?: string;
  sourceName?: string;
  sourceUrl?: string;
  files: SampleLibraryManifestFile[];
};

export type SampleLibraryManifest = {
  libraryId: string;
  displayName: string;
  license: string;
  licenseUrl?: string;
  description?: string;
  packs: SampleLibraryPackManifest[];
};

export type SampleLibraryPackCatalog = {
  id: string;
  family: SampleLibraryFamily;
  displayName: string;
  license: string;
  licenseUrl?: string;
  description?: string;
  sourceName?: string;
  sourceUrl?: string;
  fileCount: number;
  totalBytes: number;
};

export type SampleLibraryCatalog = {
  libraryId: string;
  displayName: string;
  license: string;
  licenseUrl?: string;
  description?: string;
  packs: SampleLibraryPackCatalog[];
};

export type SampleLibraryPackStatus = SampleLibraryPackCatalog & {
  state: SampleLibraryState;
  installedBytes: number;
  error?: string;
};

export type SampleLibraryStatus = {
  ok: true;
  libraryId: string;
  displayName: string;
  license: string;
  state: SampleLibraryState;
  packs: SampleLibraryPackStatus[];
  installedBytes: number;
  totalBytes: number;
  fileCount: number;
  activePackId?: string;
  error?: string;
};

export type SampleLibraryResponse = SampleLibraryStatus | {ok: false; error: string};

export type SampleLibraryRequest = {
  packId?: string;
};
