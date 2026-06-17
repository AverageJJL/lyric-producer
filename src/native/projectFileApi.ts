export type ProjectFileSaveRequest = {
  path?: string;
  content: string;
};

export type ProjectFileSaveResponse =
  | {ok: true; path: string}
  | {ok: false; error: string; canceled?: boolean};

export type ProjectFileOpenResponse =
  | {ok: true; path: string; content: string}
  | {ok: false; error: string; canceled?: boolean};

export type ProjectFileOpenRequest = {
  path?: string;
};

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
  saveProject: (request: ProjectFileSaveRequest) => Promise<ProjectFileSaveResponse>;
  openProject: (request?: ProjectFileOpenRequest) => Promise<ProjectFileOpenResponse>;
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
