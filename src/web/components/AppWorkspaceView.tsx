import React from 'react';

import type {TimeSignature} from '../../store/projectMetadata';
import type {DAWBlock, DAWTrack} from '../../store/useDAWStore';
import type {useAudioDeviceSetup} from '../../hooks/useAudioDeviceSetup';
import type {useAudioImport} from '../../hooks/useAudioImport';
import type {useMediaConsolidation} from '../../hooks/useMediaConsolidation';
import type {useMediaDropImport} from '../../hooks/useMediaDropImport';
import type {useMidiImport} from '../../hooks/useMidiImport';
import type {ProjectFileLifecycle} from '../../hooks/useProjectFileLifecycle';
import type {useRecordingLaunch} from '../../hooks/useRecordingLaunch';
import type {useSampleProviderBrowser} from '../../hooks/useSampleProviderBrowser';
import type {useSyncedScrollRefs} from '../../hooks/useSyncedScrollRefs';
import type {TrackAutomationCaptureHandler} from '../../hooks/useTrackAutomationCapture';
import type {useWorkspacePanels} from '../../hooks/useWorkspacePanels';
import type {TrackMoveDirection} from '../../music/trackOrganization';
import type {AutomationMode, AutomationTargetType} from '../../automation/trackAutomation';
import type {CopilotUiAction} from '../../assistant/copilotActions';
import type {CopilotContextPayload} from '../../assistant/copilotContext';
import type {GuideTargetId} from '../../assistant/copilotGuide';
import {ClipEditorDock} from './ClipEditorDock';
import {CopilotPanel} from './CopilotPanel';
import {GuidanceOverlay} from './GuidanceOverlay';
import {ProjectFileControls} from './ProjectFileControls';
import {RecordingSettingsOverlay} from './RecordingSettingsOverlay';
import {ResizableMixerDock} from './ResizableMixerDock';
import {RightDock} from './RightDock';
import {TimelineGrid} from './TimelineGrid';
import {TrackSidebar} from './TrackSidebar';
import {TransportBar} from './TransportBar';
import {WorkspaceNavButtons} from './WorkspaceNavButtons';

type ViewState = {
  sidebarWidth: number;
  rowHeight: number;
  isSettingsOpen: boolean;
  expandedTakeGroups: string[];
  guideTargetId: GuideTargetId | null;
  isPlaying: boolean;
  isRecording: boolean;
  canRecord: boolean;
  bpm: number;
  minBpm: number;
  maxBpm: number;
  isMetronomeEnabled: boolean;
  timeSignature: TimeSignature;
  masterVolumeDb: number;
  masterPan: number;
  fxRefreshKey: number;
  timelineRulerHeight: number;
  copilotTargets: CopilotContextPayload['visibleTargets'];
};

type WorkspaceData = {
  visibleTracks: DAWTrack[];
  hiddenTracks: DAWTrack[];
  visibleBlocks: DAWBlock[];
  selectedBlockId: string | null;
  selectedBlockIds: string[];
  selectedBlock: DAWBlock | null;
  selectedTrackId: string | null;
  selectedTrack: DAWTrack | null;
};

type WorkspaceHandlers = {
  onSidebarWidthChange: (width: number) => void;
  onRowHeightChange: (height: number) => void;
  onBpmChange: (bpm: number) => void;
  onTimeSignatureChange: (timeSignature: TimeSignature) => void;
  onToggleMetronome: () => void;
  onTogglePlay: () => void;
  onReturnToZero: () => void;
  onRecordPress: () => void;
  onFocusWorkspace: (event: React.PointerEvent<HTMLElement>) => void;
  onSelectTrack: (trackId: string) => void;
  onAddVirtualInstrument: (instrumentId: string, presetId: string) => void;
  onAddVoiceAudio: () => void;
  onAddDrumMachine: () => void;
  onMoveTrack: (trackId: string, direction: TrackMoveDirection) => void;
  onTrackArchiveChange: (trackId: string, isArchived: boolean) => void;
  onTrackDisableChange: (trackId: string, isDisabled: boolean) => void;
  onToggleMute: (trackId: string) => void;
  onToggleSolo: (trackId: string) => void;
  onToggleRecordArm: (trackId: string) => void;
  onTrackInputMonitoringChange: (trackId: string, enabled: boolean) => void;
  onTrackAutomationModeChange: (trackId: string, mode: AutomationMode) => void;
  onTrackAutomationPointSet: (trackId: string, targetType: AutomationTargetType, parameterId: string, beat: number, value: number) => void;
  onTrackAutomationPointRemove: (trackId: string, targetType: AutomationTargetType, parameterId: string, beat: number) => void;
  onTrackAutomationPointCapture: TrackAutomationCaptureHandler;
  onTrackVolumeChange: (trackId: string, volumeDb: number) => void;
  onTrackPanChange: (trackId: string, pan: number) => void;
  onTrackGainChange: (trackId: string, gainDb: number) => void;
  onMoveBlock: (blockId: string, startBeat: number, trackId: string) => void;
  onResizeBlock: (blockId: string, startBeat: number, lengthBeats: number) => void;
  onSelectBlock: (blockId: string | null, options?: {additive?: boolean}) => void;
  onUpdateBlock: (blockId: string, updates: Partial<DAWBlock>) => void;
  onDeleteBlock: (blockId: string) => void;
  onRenameMediaSource: (blockId: string, name: string) => void;
  onDuplicateMediaSource: (blockId: string) => void;
  onCompLooperLayer: (layerId: string) => void;
  onCompRecordingTake: (takeId: string) => void;
  onEditorActiveChange: (active: boolean) => void;
  onCopilotActions: (actions: CopilotUiAction[], context: CopilotContextPayload) => void;
  onClearGuide: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onToggleTakeFolder: (groupId: string) => void;
  onMasterVolumeChange: (volumeDb: number) => void;
  onMasterPanChange: (pan: number) => void;
  onOpenFx: (trackId?: string) => void;
};

type AppWorkspaceViewProps = {
  mediaDrop: ReturnType<typeof useMediaDropImport>;
  workspacePanels: ReturnType<typeof useWorkspacePanels>;
  projectFiles: ProjectFileLifecycle;
  audioImport: ReturnType<typeof useAudioImport>;
  midiImport: ReturnType<typeof useMidiImport>;
  mediaConsolidation: ReturnType<typeof useMediaConsolidation>;
  audioDeviceSetup: ReturnType<typeof useAudioDeviceSetup>;
  sampleProviderBrowser: ReturnType<typeof useSampleProviderBrowser>;
  recordingLaunch: ReturnType<typeof useRecordingLaunch>;
  scrollRefs: ReturnType<typeof useSyncedScrollRefs>;
  state: ViewState;
  data: WorkspaceData;
  handlers: WorkspaceHandlers;
};

export function AppWorkspaceView({
  mediaDrop,
  workspacePanels,
  projectFiles,
  audioImport,
  midiImport,
  mediaConsolidation,
  audioDeviceSetup,
  sampleProviderBrowser,
  recordingLaunch,
  scrollRefs,
  state,
  data,
  handlers,
}: AppWorkspaceViewProps) {
  return (
    <main className={`app-shell ${mediaDrop.isDraggingMedia ? 'media-drop-active' : ''}`} aria-label="Media drop target" {...mediaDrop.dropImportProps}>
      {mediaDrop.isDraggingMedia ? <div className="media-drop-overlay" role="status">Drop audio or MIDI to import</div> : null}
      {mediaDrop.dropImportError ? <div className="media-drop-toast" role="status">{mediaDrop.dropImportError}</div> : null}
      <TransportBar
        projectFileControls={
          <ProjectFileControls
            projectFiles={projectFiles}
            onOpenSettings={handlers.onOpenSettings}
            onClearGuide={handlers.onClearGuide}
          />
        }
        workspaceNav={<WorkspaceNavButtons rightPanel={workspacePanels.rightPanel} isMixerOpen={workspacePanels.isMixerOpen} onToggleRightPanel={workspacePanels.toggleRightPanel} onToggleMixer={workspacePanels.toggleMixer} />}
        isPlaying={state.isPlaying}
        isRecording={state.isRecording}
        isLeadInPending={recordingLaunch.isLeadInPending}
        canRecord={state.canRecord}
        bpm={state.bpm}
        timeSignature={state.timeSignature}
        minBpm={state.minBpm}
        maxBpm={state.maxBpm}
        isMetronomeEnabled={state.isMetronomeEnabled}
        onBpmChange={handlers.onBpmChange}
        onTimeSignatureChange={handlers.onTimeSignatureChange}
        onToggleMetronome={handlers.onToggleMetronome}
        onTogglePlay={handlers.onTogglePlay}
        onReturnToZero={handlers.onReturnToZero}
        onRecordPress={handlers.onRecordPress}
      />
      <GuidanceOverlay targetId={state.guideTargetId} targets={state.copilotTargets} />
      <div className="workspace-stage" style={{'--right-dock-width': workspacePanels.rightPanel ? `${workspacePanels.rightPanelWidth}px` : '0px'} as React.CSSProperties}>
        <section className="workspace" data-shortcut-scope="arrangement" tabIndex={0} aria-label="Workspace" onPointerDown={handlers.onFocusWorkspace}>
          <TrackSidebar
            width={state.sidebarWidth}
            onWidthChange={handlers.onSidebarWidthChange}
            verticalScrollRef={scrollRefs.sidebarScrollRef}
            onSidebarWheel={scrollRefs.onSidebarWheel}
            rowHeight={state.rowHeight}
            rulerHeight={state.timelineRulerHeight}
            blocks={data.visibleBlocks}
            expandedTakeGroups={state.expandedTakeGroups}
            isPlaying={state.isPlaying}
            tracks={data.visibleTracks}
            archivedTracks={data.hiddenTracks}
            selectedTrackId={data.selectedTrackId}
            onAddVirtualInstrument={handlers.onAddVirtualInstrument}
            onAddVoiceAudio={handlers.onAddVoiceAudio}
            onAddDrumMachine={handlers.onAddDrumMachine}
            onImportAudio={() => audioImport.importAudioFile()}
            onImportMidi={() => midiImport.importMidiFile()}
            isImportingAudio={audioImport.isImporting}
            isImportingMidi={midiImport.isImportingMidi}
            audioImportError={audioImport.errorMessage}
            midiImportError={midiImport.midiImportError}
            onMoveTrack={handlers.onMoveTrack}
            onTrackArchiveChange={handlers.onTrackArchiveChange}
            onTrackDisableChange={handlers.onTrackDisableChange}
            onToggleMute={handlers.onToggleMute}
            onToggleSolo={handlers.onToggleSolo}
            onSelectTrack={handlers.onSelectTrack}
            onToggleRecordArm={handlers.onToggleRecordArm}
            onTrackInputMonitoringChange={handlers.onTrackInputMonitoringChange}
            onTrackAutomationModeChange={handlers.onTrackAutomationModeChange}
            onTrackAutomationPointSet={handlers.onTrackAutomationPointSet}
            onTrackAutomationPointRemove={handlers.onTrackAutomationPointRemove}
            onTrackAutomationPointCapture={handlers.onTrackAutomationPointCapture}
            onTrackVolumeChange={handlers.onTrackVolumeChange}
            onTrackPanChange={handlers.onTrackPanChange}
            onTrackGainChange={handlers.onTrackGainChange}
          />
          <TimelineGrid
            tracks={data.visibleTracks}
            blocks={data.visibleBlocks}
            selectedBlockId={data.selectedBlockId}
            selectedBlockIds={data.selectedBlockIds}
            verticalScrollRef={scrollRefs.timelineScrollRef}
            onVerticalScroll={scrollRefs.onTimelineScroll}
            rowHeight={state.rowHeight}
            expandedTakeGroups={state.expandedTakeGroups}
            onToggleTakeFolder={handlers.onToggleTakeFolder}
            onRowHeightChange={handlers.onRowHeightChange}
            onMoveBlock={handlers.onMoveBlock}
            onResizeBlock={handlers.onResizeBlock}
            onSelectBlock={handlers.onSelectBlock}
            onUpdateBlock={handlers.onUpdateBlock}
            onDeleteBlock={handlers.onDeleteBlock}
            importAudioFile={audioImport.importAudioFile}
            onTimelineMediaDropHandled={mediaDrop.clearMediaDragState}
            isLyricsPanelOpen={workspacePanels.rightPanel === 'lyrics'}
            areColoredSectionsHidden={workspacePanels.areColoredSectionsHidden}
            rulerHeight={state.timelineRulerHeight}
          />
        </section>
        {workspacePanels.isMixerOpen ? (
          <ResizableMixerDock
            tracks={data.visibleTracks}
            masterVolumeDb={state.masterVolumeDb}
            masterPan={state.masterPan}
            fxRefreshKey={state.fxRefreshKey}
            onClose={workspacePanels.closeMixer}
            onMasterVolumeChange={handlers.onMasterVolumeChange}
            onMasterPanChange={handlers.onMasterPanChange}
            onTrackVolumeChange={handlers.onTrackVolumeChange}
            onTrackPanChange={handlers.onTrackPanChange}
            onToggleMute={handlers.onToggleMute}
            onToggleSolo={handlers.onToggleSolo}
            onOpenFx={handlers.onOpenFx}
          />
        ) : null}
        <ClipEditorDock recordingLaunch={recordingLaunch} editorSuppressed={workspacePanels.isMixerOpen || !workspacePanels.isEditorOpen} sampleLibraryStatus={sampleProviderBrowser.libraryStatus} onDownloadDrumLibrary={() => sampleProviderBrowser.downloadLibrary('core-drums')} onEditorActiveChange={handlers.onEditorActiveChange} onEditorClose={workspacePanels.closeEditor} />
        {workspacePanels.rightPanel ? (
          <RightDock
            panel={workspacePanels.rightPanel}
            width={workspacePanels.rightPanelWidth}
            onWidthChange={workspacePanels.setRightPanelWidth}
            copilotPanel={<CopilotPanel uiState={{rightPanel: workspacePanels.rightPanel, isMixerOpen: workspacePanels.isMixerOpen, selectedTrackId: data.selectedTrackId, selectedTrackName: data.selectedTrack?.name, selectedBlockName: data.selectedBlock?.name, trackCount: data.visibleTracks.length, hasSelectedBlock: data.selectedBlock != null, bpm: state.bpm, isPlaying: state.isPlaying, isRecording: state.isRecording, visibleTrackNames: data.visibleTracks.map(track => track.name)}} onActions={handlers.onCopilotActions} />}
            sampleProviderBrowser={sampleProviderBrowser}
            onImportProviderSample={absolutePath => audioImport.importAudioFile({path: absolutePath})}
            isImportingAudio={audioImport.isImporting}
            blocks={data.visibleBlocks}
            tracks={data.visibleTracks}
            selectedBlockId={data.selectedBlockId}
            selectedBlock={data.selectedBlock}
            isRelinkingAudio={audioImport.isRelinking}
            onSelectBlock={handlers.onSelectBlock}
            onRelinkAudio={audioImport.relinkAudioFile}
            onRevealAudio={audioImport.revealAudioFile}
            onRenameMediaSource={handlers.onRenameMediaSource}
            onDuplicateMediaSource={handlers.onDuplicateMediaSource}
            mediaConsolidation={mediaConsolidation}
            onCompLooperLayer={handlers.onCompLooperLayer}
            onCompRecordingTake={handlers.onCompRecordingTake}
            audioDeviceSetup={audioDeviceSetup}
          />
        ) : null}
      </div>
      {state.isSettingsOpen ? (
        <RecordingSettingsOverlay
          recordingLaunch={recordingLaunch}
          areColoredSectionsHidden={workspacePanels.areColoredSectionsHidden}
          onColoredSectionsHiddenChange={workspacePanels.setColoredSectionsHidden}
          onClose={handlers.onCloseSettings}
        />
      ) : null}
    </main>
  );
}
