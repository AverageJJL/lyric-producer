import {contextBridge, ipcRenderer, webUtils} from 'electron';

type AudioEngineEventName =
  | 'onTransportUpdate'
  | 'onRecordingUpdate'
  | 'onDrumPatternStep'
  | 'onSpectrogramReady'
  | 'onMixMeterUpdate';

type RuntimeUpdateStatus = {
  state: string;
  message: string;
  version?: string;
  percent?: number;
  feedUrl?: string;
  channel?: string;
};

contextBridge.exposeInMainWorld('audioEngine', {
  sendCommand(command: string, payloadJson: string): string {
    return ipcRenderer.sendSync('audio-engine:send-command', command, payloadJson);
  },

  sendCommandAsync(command: string, payloadJson: string): Promise<string> {
    return ipcRenderer.invoke('audio-engine:send-command-async', command, payloadJson);
  },

  onEvent(
    eventName: AudioEngineEventName,
    callback: (payloadJson: string) => void,
  ): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      incomingName: AudioEngineEventName,
      payloadJson: string,
    ) => {
      if (incomingName === eventName) {
        callback(payloadJson);
      }
    };

    ipcRenderer.on('audio-engine:event', listener);
    return () => ipcRenderer.removeListener('audio-engine:event', listener);
  },
});

contextBridge.exposeInMainWorld('projectFiles', {
  saveProjectFolder(request: {
    folderPath?: string;
    files: Array<{relativePath: string; content: string}>;
  }) {
    return ipcRenderer.invoke('apc-project:save-folder', request);
  },

  openProjectFolder(request?: {path?: string}) {
    return ipcRenderer.invoke('apc-project:open-folder', request);
  },

  setProjectAssetRoot(request: {folderPath: string | null}) {
    return ipcRenderer.invoke('apc-project:set-active-root', request);
  },

  exportMixdown(request?: {title?: string; defaultPath?: string}) {
    return ipcRenderer.invoke('project-file:export-mixdown', request);
  },

  exportDawProject(request: {
    projectXml: string;
    metadataXml: string;
    extensionJson?: string;
    defaultPath?: string;
    mediaFiles: Array<{archivePath: string; sourcePath: string}>;
  }) {
    return ipcRenderer.invoke('project-file:export-dawproject', request);
  },

  importDawProject(request?: {path?: string}) {
    return ipcRenderer.invoke('project-file:import-dawproject', request);
  },

  exportStems(request: {title?: string; defaultPath?: string; tracks: Array<{trackId: string; name: string}>}) {
    return ipcRenderer.invoke('project-file:export-stems', request);
  },

  writeMidiFile(request: {path?: string; defaultPath?: string; base64: string}) {
    return ipcRenderer.invoke('project-file:write-midi', request);
  },
});

contextBridge.exposeInMainWorld('appLifecycle', {
  onProjectCommand(callback: (command: {command: string; path?: string}) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      command: {command: string; path?: string},
    ) => callback(command);

    ipcRenderer.on('app-lifecycle:project-command', listener);
    return () => ipcRenderer.removeListener('app-lifecycle:project-command', listener);
  },

  rendererReady(): void {
    ipcRenderer.send('app-lifecycle:renderer-ready');
  },

  setProjectDirty(isDirty: boolean): void {
    ipcRenderer.send('app-lifecycle:set-project-dirty', isDirty);
  },
});

contextBridge.exposeInMainWorld('appEnvironment', {
  platform: process.platform,
});

contextBridge.exposeInMainWorld('appUpdates', {
  onStatus(callback: (status: RuntimeUpdateStatus) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      status: RuntimeUpdateStatus,
    ) => callback(status);

    ipcRenderer.on('app-updates:status', listener);
    return () => ipcRenderer.removeListener('app-updates:status', listener);
  },
});

contextBridge.exposeInMainWorld('copilot', {
  agentAsk(request: {
    message: string;
    history?: Array<{role: 'user' | 'assistant'; content: string}>;
    conversationSummary?: string;
    context?: Record<string, unknown>;
    mode?: 'build' | 'ask';
    tree?: {
      fingerprint: string;
      files: Record<string, string>;
      index: Array<{path: string; bytes: number; contentHash: string}>;
    };
  }) {
    return ipcRenderer.invoke('copilot:agent-ask', request);
  },

  compact(request: {
    history: Array<{role: 'user' | 'assistant'; content: string}>;
    conversationSummary?: string;
    currentUserMessage?: string;
    uiState?: Record<string, unknown>;
    context?: Record<string, unknown>;
  }) {
    return ipcRenderer.invoke('copilot:compact', request);
  },
});

contextBridge.exposeInMainWorld('songSeed', {
  search(request: {query?: string; limit?: number}) {
    return ipcRenderer.invoke('song-seed:search', request);
  },

  getLyrics(request: {
    trackId?: string;
    trackIsrc?: string;
    commontrackId?: string;
    hasTrackStructure?: boolean;
  }) {
    return ipcRenderer.invoke('song-seed:get-lyrics', request);
  },

  checkLyricsSimilarity(request: {lyrics?: string; lineIds?: string[]}) {
    return ipcRenderer.invoke('song-seed:check-lyrics-similarity', request);
  },

  lookupBpmKey(request: {title?: string; artist?: string}) {
    return ipcRenderer.invoke('song-seed:lookup-bpm-key', request);
  },

  analyze(request: Record<string, unknown>) {
    return ipcRenderer.invoke('song-seed:analyze', request);
  },

  analyzeReference(request: Record<string, unknown>) {
    return ipcRenderer.invoke('song-seed:analyze-reference', request);
  },
});

contextBridge.exposeInMainWorld('fxWindow', {
  open(trackId: string): void {
    ipcRenderer.send('fx-window:open', trackId);
  },

  syncState(payload: {
    targetTrackId: string | null;
    selectedTrackId: string | null;
    tracks: Array<{id: string; name: string; type: string; instrumentId?: string; presetId?: string; automationMode?: string}>;
  }): void {
    ipcRenderer.send('fx-window:sync', payload);
  },

  onState(callback: (payload: {
    targetTrackId: string | null;
    selectedTrackId: string | null;
    tracks: Array<{id: string; name: string; type: string; instrumentId?: string; presetId?: string; automationMode?: string}>;
  }) => void): () => void {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: {
        targetTrackId: string | null;
        selectedTrackId: string | null;
        tracks: Array<{id: string; name: string; type: string; instrumentId?: string; presetId?: string; automationMode?: string}>;
      },
    ) => callback(payload);
    ipcRenderer.on('fx-window:state', listener);
    return () => ipcRenderer.removeListener('fx-window:state', listener);
  },

  notifyChanged(): void {
    ipcRenderer.send('fx-window:changed');
  },

  onSummaryRefresh(callback: () => void): () => void {
    const listener = () => callback();
    ipcRenderer.on('fx-summary:refresh', listener);
    return () => ipcRenderer.removeListener('fx-summary:refresh', listener);
  },
});

contextBridge.exposeInMainWorld('mediaImport', {
  pathForFile(file: File): string | null {
    const filePath = webUtils.getPathForFile(file);
    return filePath.length > 0 ? filePath : null;
  },

  importAudio(request?: {path?: string}) {
    return ipcRenderer.invoke('media-file:import-audio', request);
  },

  importMidi(request?: {path?: string}) {
    return ipcRenderer.invoke('media-file:import-midi', request);
  },

  relinkAudio(request?: {path?: string}) {
    return ipcRenderer.invoke('media-file:relink-audio', request);
  },

  duplicateAudio(request: {path?: string}) {
    return ipcRenderer.invoke('media-file:duplicate-audio', request);
  },

  recoverOfflineAudio(request: {
    folderPath?: string;
    sources: Array<{sourceKey: string; sourcePath: string; name: string}>;
  }) {
    return ipcRenderer.invoke('media-file:recover-offline-audio', request);
  },

  prepareAudioRender(request?: {defaultPath?: string}) {
    return ipcRenderer.invoke('media-file:prepare-audio-render', request);
  },

  resolveAudioMedia(request: {references: Array<{
    clipId: string;
    trackId: string;
    relativePath?: string;
    absolutePath?: string;
  }>}) {
    return ipcRenderer.invoke('media-file:resolve-audio', request);
  },

  revealAudioMedia(request: {path?: string}) {
    return ipcRenderer.invoke('media-file:reveal-audio', request);
  },

  browseSamples(request?: {
    providerId?: string;
    query?: string;
    family?: string;
    tags?: string[];
    limit?: number;
  }) {
    return ipcRenderer.invoke('sample-provider:browse', request);
  },

  sampleLibraryStatus() {
    return ipcRenderer.invoke('sample-library:status');
  },

  downloadSampleLibrary(request?: {packId?: string}) {
    return ipcRenderer.invoke('sample-library:download', request);
  },

  deleteSampleLibraryPack(request: {packId: string}) {
    return ipcRenderer.invoke('sample-library:delete', request);
  },

  cancelSampleLibraryDownload(request?: {packId?: string}) {
    return ipcRenderer.invoke('sample-library:cancel', request);
  },
});
