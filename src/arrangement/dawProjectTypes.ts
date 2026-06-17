import type {AudioAnalysis} from '../music/audioImport';
import type {ProjectSnapshot} from './projectSnapshot';

export type DawProjectMediaExport = {
  archivePath: string;
  sourcePath: string;
};

export type DawProjectExportPackage = {
  projectXml: string;
  metadataXml: string;
  extensionJson: string;
  mediaFiles: DawProjectMediaExport[];
  skippedMediaCount: number;
};

export type DawProjectImportedMedia = {
  archivePath: string;
  relativePath: string;
  absolutePath: string;
  name: string;
};

export type DawProjectImportPackage = {
  projectXml: string;
  metadataXml?: string;
  extensionJson?: string;
  mediaFiles: DawProjectImportedMedia[];
};

export type DawProjectAudioAnalyzer = (
  media: DawProjectImportedMedia,
) => AudioAnalysis | null;

export type DawProjectImportResult =
  | {
      ok: true;
      snapshot: ProjectSnapshot;
      importedTrackCount: number;
      importedClipCount: number;
      failedAnalysisCount: number;
      missingMediaCount: number;
      skippedClipCount: number;
      unsupportedContentCount: number;
    }
  | {ok: false; error: string};
