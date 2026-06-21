import type {MidiExportMode} from '../arrangement/projectExportActions';

export type ProjectFileLifecycle = {
  currentPath: string | null;
  displayName: string;
  isDirty: boolean;
  isBusy: boolean;
  hasAutosave: boolean;
  recentProjects: string[];
  statusMessage: string;
  errorMessage: string | null;
  newProject: () => Promise<boolean>;
  requestNewProject?: () => Promise<boolean>;
  openProject: () => Promise<void>;
  openRecentProject: (path: string) => Promise<void>;
  importDawProject: () => Promise<void>;
  importDawProjectPath: (path: string) => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  exportMixdown: () => Promise<void>;
  exportCycleMixdown: () => Promise<void>;
  exportSelectedClip: () => Promise<void>;
  exportStems: () => Promise<void>;
  exportMidi: (mode?: MidiExportMode) => Promise<void>;
  exportDawProject: () => Promise<void>;
  cancelExport: () => void;
  canCancelExport: boolean;
  recoverAutosave: () => Promise<void>;
};
