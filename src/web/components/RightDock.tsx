import React, {useRef} from 'react';

import type {useAudioDeviceSetup} from '../../hooks/useAudioDeviceSetup';
import type {MediaConsolidationControls} from '../../hooks/useMediaConsolidation';
import type {SampleProviderBrowserState} from '../../hooks/useSampleProviderBrowser';
import {
  RIGHT_DOCK_MAX_WIDTH,
  RIGHT_DOCK_MIN_WIDTH,
  type RightPanelId,
} from '../../hooks/useWorkspacePanels';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import {AudioDevicePanel} from './AudioDevicePanel';
import {LooperCompPanel} from './LooperCompPanel';
import {LyricsPanel} from './LyricsPanel';
import {MediaBinPanel} from './MediaBinPanel';
import {RecordingTakesPanel} from './RecordingTakesPanel';
import {SampleProviderPanel} from './SampleProviderPanel';
import {SelectedMediaInspector} from './SelectedMediaInspector';

type RightDockProps = {
  panel: RightPanelId;
  width: number;
  onWidthChange: (width: number) => void;
  copilotPanel?: React.ReactNode;
  sampleProviderBrowser: SampleProviderBrowserState;
  onImportProviderSample: (absolutePath: string) => void;
  isImportingAudio: boolean;
  blocks: DAWBlock[];
  tracks: DAWTrack[];
  selectedBlockId: string | null;
  selectedBlock: DAWBlock | null;
  isRelinkingAudio: boolean;
  onSelectBlock: (blockId: string) => void;
  onRelinkAudio: (blockId: string) => void;
  onRevealAudio: (path?: string) => void;
  onRenameMediaSource: (blockId: string, name: string) => void;
  onDuplicateMediaSource: (blockId: string) => void;
  mediaConsolidation: MediaConsolidationControls;
  onCompLooperLayer: (layerId: string) => void;
  onCompRecordingTake: (takeId: string) => void;
  audioDeviceSetup: ReturnType<typeof useAudioDeviceSetup>;
};

const PANEL_TITLES: Record<RightPanelId, string> = {
  samples: 'Samples',
  browser: 'Browser',
  audio: 'Audio',
  lyrics: 'Lyrics',
  copilot: 'Co-producer',
};

export function RightDock({
  panel,
  width,
  onWidthChange,
  copilotPanel,
  sampleProviderBrowser,
  onImportProviderSample,
  isImportingAudio,
  blocks,
  tracks,
  selectedBlockId,
  selectedBlock,
  isRelinkingAudio,
  onSelectBlock,
  onRelinkAudio,
  onRevealAudio,
  onRenameMediaSource,
  onDuplicateMediaSource,
  mediaConsolidation,
  onCompLooperLayer,
  onCompRecordingTake,
  audioDeviceSetup,
}: RightDockProps) {
  const dragRef = useRef<{pointerId: number; originX: number; originWidth: number} | null>(null);

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {pointerId: event.pointerId, originX: event.pageX, originWidth: width};
  };

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = dragRef.current;
    if (!session || session.pointerId !== event.pointerId) {
      return;
    }
    const next = session.originWidth + (session.originX - event.pageX);
    onWidthChange(Math.min(RIGHT_DOCK_MAX_WIDTH, Math.max(RIGHT_DOCK_MIN_WIDTH, next)));
  };

  const endResize = (event: React.PointerEvent<HTMLDivElement>) => {
    resize(event);
    dragRef.current = null;
  };

  return (
    <aside className="right-dock" data-panel={panel} style={{width}} aria-label={PANEL_TITLES[panel]}>
      <div
        className="right-dock-resize"
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={endResize}
        onPointerCancel={endResize}
      />
      <header className="right-dock-header">
        <span>{PANEL_TITLES[panel]}</span>
      </header>
      <div className="right-dock-body">
        {panel === 'samples' ? (
          <SampleProviderPanel
            samples={sampleProviderBrowser.samples}
            query={sampleProviderBrowser.query}
            familyFilter={sampleProviderBrowser.familyFilter}
            isBrowsing={sampleProviderBrowser.isBrowsing}
            libraryStatus={sampleProviderBrowser.libraryStatus}
            isDownloadingLibrary={sampleProviderBrowser.isDownloadingLibrary}
            isImportingAudio={isImportingAudio}
            errorMessage={sampleProviderBrowser.errorMessage}
            onSearch={sampleProviderBrowser.search}
            onSelectFamily={sampleProviderBrowser.selectFamily}
            onRefresh={sampleProviderBrowser.refresh}
            onDownloadLibrary={sampleProviderBrowser.downloadLibrary}
            onDeleteLibraryPack={sampleProviderBrowser.deleteLibraryPack}
            onCancelLibraryDownload={sampleProviderBrowser.cancelLibraryDownload}
            onImportSample={onImportProviderSample}
          />
        ) : null}
        {panel === 'browser' ? (
          <>
            <MediaBinPanel
              blocks={blocks}
              selectedBlockId={selectedBlockId}
              isRelinkingAudio={isRelinkingAudio}
              isImportingAudio={isImportingAudio}
              onSelectBlock={onSelectBlock}
              onRelinkAudio={onRelinkAudio}
              onRevealAudio={onRevealAudio}
              onRenameSource={onRenameMediaSource}
              onDuplicateSource={onDuplicateMediaSource}
              onConsolidateProjectMedia={mediaConsolidation.consolidateProjectMedia}
              onRecoverOfflineMedia={mediaConsolidation.recoverOfflineMedia}
              isConsolidatingMedia={mediaConsolidation.isConsolidatingMedia}
              isRecoveringOfflineMedia={mediaConsolidation.isRecoveringOfflineMedia}
              consolidationMessage={mediaConsolidation.mediaConsolidationMessage}
              offlineRecoveryMessage={mediaConsolidation.offlineMediaRecoveryMessage}
            />
            <SelectedMediaInspector
              block={selectedBlock}
              isRelinkingAudio={isRelinkingAudio}
              isImportingAudio={isImportingAudio}
              onRelinkAudio={onRelinkAudio}
            />
            <LooperCompPanel
              blocks={blocks}
              tracks={tracks}
              onCompLayer={onCompLooperLayer}
              onSelectBlock={onSelectBlock}
            />
            <RecordingTakesPanel
              blocks={blocks}
              tracks={tracks}
              onCompTake={onCompRecordingTake}
              onSelectBlock={onSelectBlock}
            />
          </>
        ) : null}
        {panel === 'audio' ? (
          <AudioDevicePanel
            outputs={audioDeviceSetup.outputs}
            inputs={audioDeviceSetup.inputs}
            status={audioDeviceSetup.status}
            isBusy={audioDeviceSetup.isBusy}
            errorMessage={audioDeviceSetup.errorMessage}
            onRefresh={audioDeviceSetup.refreshDevices}
            onOutputChange={audioDeviceSetup.setOutputDevice}
            onInputChange={audioDeviceSetup.setInputDevice}
            onSettingsChange={audioDeviceSetup.setDeviceSettings}
          />
        ) : null}
        {panel === 'lyrics' ? (
          <LyricsPanel />
        ) : null}
        {panel === 'copilot' ? copilotPanel : null}
      </div>
    </aside>
  );
}
