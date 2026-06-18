import type {ApcSourceFile} from '../arrangement/apc';

/**
 * Save the working `.apc` source tree to a project folder. `folderPath` is omitted
 * for "Save As" (the main process shows a directory picker) and supplied for "Save".
 */
export type ApcProjectSaveRequest = {
  folderPath?: string;
  files: ApcSourceFile[];
};

export type ApcProjectSaveResponse =
  | {ok: true; path: string}
  | {ok: false; error: string; canceled?: boolean};

export type ApcProjectOpenRequest = {
  path?: string;
};

export type ApcProjectOpenResponse =
  | {ok: true; path: string; files: ApcSourceFile[]}
  | {ok: false; error: string; canceled?: boolean};

/**
 * Point the native engine's writable asset root at the open project's
 * `Song.apc/assets` (or back to the unsaved-draft root when `folderPath` is null).
 */
export type ApcAssetRootRequest = {
  folderPath: string | null;
};

export type ApcAssetRootResponse =
  | {ok: true; writableRoot: string}
  | {ok: false; error: string};

export type ProjectFileExportResponse =
  | {ok: true; path: string}
  | {ok: false; error: string; canceled?: boolean};

export type ProjectFileMidiWriteRequest = {
  path?: string;
  defaultPath?: string;
  base64: string;
};

export type DawProjectMediaFileRequest = {
  archivePath: string;
  sourcePath: string;
};

export type DawProjectExportRequest = {
  projectXml: string;
  metadataXml: string;
  extensionJson?: string;
  defaultPath?: string;
  mediaFiles: DawProjectMediaFileRequest[];
};

export type DawProjectImportRequest = {
  path?: string;
};

export type DawProjectImportedMediaFile = {
  archivePath: string;
  relativePath: string;
  absolutePath: string;
  name: string;
};

export type DawProjectImportResponse =
  | {
      ok: true;
      path: string;
      projectXml: string;
      metadataXml?: string;
      extensionJson?: string;
      mediaFiles: DawProjectImportedMediaFile[];
    }
  | {ok: false; error: string; canceled?: boolean};

export type ProjectFileMixdownRequest = {
  title?: string;
  defaultPath?: string;
};

export type ProjectFileStemDestinationTrack = {
  trackId: string;
  name: string;
};

export type ProjectFileStemExportRequest = {
  title?: string;
  defaultPath?: string;
  tracks: ProjectFileStemDestinationTrack[];
};

export type ProjectFileStemExportResponse =
  | {
      ok: true;
      directoryPath: string;
      stems: Array<{trackId: string; path: string}>;
    }
  | {ok: false; error: string; canceled?: boolean};

export type ProjectFileBridge = {
  saveProjectFolder: (request: ApcProjectSaveRequest) => Promise<ApcProjectSaveResponse>;
  openProjectFolder: (request?: ApcProjectOpenRequest) => Promise<ApcProjectOpenResponse>;
  setProjectAssetRoot: (request: ApcAssetRootRequest) => Promise<ApcAssetRootResponse>;
  exportMixdown: (request?: ProjectFileMixdownRequest) => Promise<ProjectFileExportResponse>;
  exportDawProject?: (request: DawProjectExportRequest) => Promise<ProjectFileExportResponse>;
  importDawProject?: (request?: DawProjectImportRequest) => Promise<DawProjectImportResponse>;
  exportStems?: (request: ProjectFileStemExportRequest) => Promise<ProjectFileStemExportResponse>;
  writeMidiFile?: (request: ProjectFileMidiWriteRequest) => Promise<ProjectFileExportResponse>;
};

declare global {
  interface Window {
    projectFiles?: ProjectFileBridge;
  }
}

export function getProjectFileBridge(): ProjectFileBridge | null {
  return globalThis.window?.projectFiles ?? null;
}
