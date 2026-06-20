import React, {useCallback, useEffect, useState} from 'react';
import {useAudioDeviceSetup} from '../hooks/useAudioDeviceSetup';
import {useAudioImport} from '../hooks/useAudioImport';
import {useCopilotGuidance} from '../hooks/useCopilotGuidance';
import {useFxWindowSync} from '../hooks/useFxWindowSync';
import {useMediaDropImport} from '../hooks/useMediaDropImport';
import {useMediaConsolidation} from '../hooks/useMediaConsolidation';
import {useMidiImport} from '../hooks/useMidiImport';
import {useLivePreviewTicker} from '../hooks/useLivePreviewTicker';
import {usePlaybackPlayheadTicker} from '../hooks/usePlaybackPlayheadTicker';
import {useEditorTracks} from '../hooks/useEditorTracks';
import type {ProjectFileLifecycle} from '../hooks/useProjectFileLifecycle';
import {useRecordingLaunch} from '../hooks/useRecordingLaunch';
import {useSampleProviderBrowser} from '../hooks/useSampleProviderBrowser';
import {useSyncedScrollRefs} from '../hooks/useSyncedScrollRefs';
import {TIMELINE_RETURN_TO_ZERO_EVENT} from '../hooks/useTimelineOriginScroll';
import {useTransportShortcuts} from '../hooks/useTransportShortcuts';
import {useTrackAutomationCapture} from '../hooks/useTrackAutomationCapture';
import {useUndoRedoShortcuts} from '../hooks/useUndoRedoShortcuts';
import {useWorkspacePanels} from '../hooks/useWorkspacePanels';
import {moveSelectedClipsAsGroup} from '../arrangement/clipBulkMove';
import {activeTracks, archivedTracks, blocksForActiveTracks} from '../music/trackOrganization';
import {sendNativeAudioCommand} from '../native/NativeAudioEngine';
import {refreshPlaybackOutputAfterVoice} from '../native/refreshPlayback';
import {toggleTransportPlayback} from '../store/dawRecording';
import {useDAWNativeBridge} from '../store/useDAWNativeBridge';
import {useDAWNativeEvents} from '../store/useDAWNativeEvents';
import {useDAWStore} from '../store/useDAWStore';
import {AppWorkspaceView} from './components/AppWorkspaceView';
import {ROW_HEIGHT, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_MIN_WIDTH, sidebarMaxWidth} from '../ui/timelineLayout';
import {shouldFocusWorkspaceFromPointer} from './workspaceShortcuts';

const MIN_BPM = 20, MAX_BPM = 300;
type DawWorkspaceAppProps = {projectFiles: ProjectFileLifecycle};

export function DawWorkspaceApp({projectFiles}: DawWorkspaceAppProps) {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [timelineRowHeight, setTimelineRowHeight] = useState(ROW_HEIGHT);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [expandedTakeGroups, setExpandedTakeGroups] = useState<string[]>([]);
  const workspacePanels = useWorkspacePanels();
  const copilotGuidance = useCopilotGuidance(workspacePanels);
  useDAWNativeBridge(); useDAWNativeEvents();
  usePlaybackPlayheadTicker(); useLivePreviewTicker(); useUndoRedoShortcuts();
  const audioImport = useAudioImport();
  const midiImport = useMidiImport();
  const mediaDrop = useMediaDropImport(audioImport.importAudioFile, midiImport.importMidiFile);
  const mediaConsolidation = useMediaConsolidation();
  const audioDeviceSetup = useAudioDeviceSetup();
  const sampleProviderBrowser = useSampleProviderBrowser();

  const isPlaying = useDAWStore(state => state.isPlaying);
  const isRecording = useDAWStore(state => state.isRecording);
  const bpm = useDAWStore(state => state.bpm);
  const isMetronomeEnabled = useDAWStore(state => state.isMetronomeEnabled);
  const timeSignature = useDAWStore(state => state.timeSignature);
  const tracks = useDAWStore(state => state.tracks);
  const blocks = useDAWStore(state => state.blocks);
  const masterVolumeDb = useDAWStore(state => state.masterVolumeDb);
  const masterPan = useDAWStore(state => state.masterPan);
  const selectedBlockId = useDAWStore(state => state.selectedBlockId);
  const selectedBlockIds = useDAWStore(state => state.selectedBlockIds);
  const selectedTrackId = useDAWStore(state => state.selectedTrackId);
  const setPlayheadBeat = useDAWStore(state => state.setPlayheadBeat);
  const setBpm = useDAWStore(state => state.setBpm);
  const setTimeSignature = useDAWStore(state => state.setTimeSignature);
  const setMetronomeEnabled = useDAWStore(state => state.setMetronomeEnabled);
  const selectTrack = useDAWStore(state => state.selectTrack);
  const addTrackFromTemplate = useDAWStore(state => state.addTrackFromTemplate);
  const addVoiceAudioTrack = useDAWStore(state => state.addVoiceAudioTrack);
  const addDrumMachineTrack = useDAWStore(state => state.addDrumMachineTrack);
  const toggleTrackMute = useDAWStore(state => state.toggleTrackMute);
  const toggleTrackSolo = useDAWStore(state => state.toggleTrackSolo);
  const toggleTrackRecordArm = useDAWStore(state => state.toggleTrackRecordArm);
  const moveTrack = useDAWStore(state => state.moveTrack);
  const setTrackArchived = useDAWStore(state => state.setTrackArchived);
  const setTrackDisabled = useDAWStore(state => state.setTrackDisabled);
  const setTrackInputMonitoring = useDAWStore(state => state.setTrackInputMonitoring);
  const setTrackAutomationMode = useDAWStore(state => state.setTrackAutomationMode);
  const setTrackAutomationPoint = useDAWStore(state => state.setTrackAutomationPoint);
  const removeTrackAutomationPoint = useDAWStore(state => state.removeTrackAutomationPoint);
  const captureTrackAutomationPoint = useTrackAutomationCapture();
  const setTrackVolumeDb = useDAWStore(state => state.setTrackVolumeDb);
  const setTrackPan = useDAWStore(state => state.setTrackPan);
  const setTrackGainDb = useDAWStore(state => state.setTrackGainDb);
  const setMasterVolumeDb = useDAWStore(state => state.setMasterVolumeDb);
  const setMasterPan = useDAWStore(state => state.setMasterPan);
  const moveBlock = useDAWStore(state => state.moveBlock);
  const resizeBlock = useDAWStore(state => state.resizeBlock);
  const selectBlock = useDAWStore(state => state.selectBlock);
  const setMediaSourceName = useDAWStore(state => state.setMediaSourceName);
  const updateBlock = useDAWStore(state => state.updateBlock);
  const compLooperLayer = useDAWStore(state => state.compLooperLayer);
  const compRecordingTake = useDAWStore(state => state.compRecordingTake);
  const removeBlock = useDAWStore(state => state.removeBlock);
  const scrollRefs = useSyncedScrollRefs();
  const visibleTracks = activeTracks(tracks), hiddenTracks = archivedTracks(tracks), visibleBlocks = blocksForActiveTracks(blocks, tracks);
  const selectedBlock = selectedBlockId ? visibleBlocks.find(block => block.id === selectedBlockId) ?? null : null, selectedTrack = selectedTrackId ? visibleTracks.find(track => track.id === selectedTrackId) ?? null : null;
  const {armedTrack, activeTrack} = useEditorTracks();
  const recordingLaunch = useRecordingLaunch({armedTrack, activeTrack});
  const recordTarget = armedTrack ?? activeTrack;
  const canRecord = recordTarget != null && recordTarget.type !== 'drum_machine';
  const [fxTargetTrackId, setFxTargetTrackId] = useState<string | null>(null);
  const {fxRefreshKey} = useFxWindowSync(visibleTracks, selectedTrackId, fxTargetTrackId);

  const openFxWindow = useCallback(
    (trackId?: string) => {
      const id = trackId ?? selectedTrackId ?? visibleTracks[0]?.id;
      if (!id) {
        return;
      }
      setFxTargetTrackId(id);
      if (id !== selectedTrackId) {
        selectTrack(id);
      }
      const bridge = window.fxWindow;
      if (bridge?.syncState) {
        bridge.syncState({
          targetTrackId: id,
          selectedTrackId: id,
          tracks: visibleTracks.map(track => ({
            id: track.id, name: track.name, type: track.type,
            instrumentId: track.instrumentId, presetId: track.presetId, automationMode: track.automationMode,
          })),
        });
      }
      bridge?.open?.(id);
    },
    [selectedTrackId, selectTrack, visibleTracks],
  );

  useEffect(() => {
    setFxTargetTrackId(selectedTrackId);
  }, [selectedTrackId]);

  const handleSelectTrack = useCallback(
    (trackId: string) => {
      selectTrack(trackId);
      workspacePanels.openEditor();
      workspacePanels.closeMixer();
    },
    [selectTrack, workspacePanels],
  );

  const handleSelectBlock = useCallback(
    (blockId: string | null, options?: {additive?: boolean}) => {
      selectBlock(blockId, options);
      if (blockId) {
        workspacePanels.openEditor();
      }
    },
    [selectBlock, workspacePanels],
  );

  const handleEditorActiveChange = useCallback(
    (active: boolean) => {
      if (active && workspacePanels.isMixerOpen) {
        workspacePanels.closeMixer();
      }
    },
    [workspacePanels],
  );

  const handleSidebarWidthChange = useCallback((width: number) => {
    setSidebarWidth(Math.min(sidebarMaxWidth(window.innerWidth), Math.max(SIDEBAR_MIN_WIDTH, width)));
  }, []);

  const handleRefreshAudioDevice = useCallback(() => {
    refreshPlaybackOutputAfterVoice();
  }, []);

  useEffect(() => {
    const startupTimer = window.setTimeout(handleRefreshAudioDevice, 400);
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        handleRefreshAudioDevice();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(startupTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [handleRefreshAudioDevice]);

  const handleTogglePlay = useCallback(() => {
    toggleTransportPlayback();
  }, []);

  const handleReturnToZero = useCallback(() => {
    setPlayheadBeat(0, {pauseIfPlaying: true});
    window.dispatchEvent(new Event(TIMELINE_RETURN_TO_ZERO_EVENT));
    sendNativeAudioCommand('return_to_zero', {});
  }, [setPlayheadBeat]);

  const focusWorkspace = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (shouldFocusWorkspaceFromPointer(event)) {
      event.currentTarget.focus({preventScroll: true});
    }
  }, []);

  const handleBpmChange = useCallback(
    (nextBpm: number) => {
      setBpm(Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(nextBpm))));
    },
    [setBpm],
  );

  const handleMoveBlock = useCallback(
    (blockId: string, startBeat: number, trackId: string) => {
      if (!moveSelectedClipsAsGroup(blockId, startBeat, trackId)) {
        moveBlock(blockId, startBeat, trackId);
      }
    },
    [moveBlock],
  );

  const handleRecordPress = useCallback(() => {
    if (isRecording) {
      recordingLaunch.handleStopRecording();
      return;
    }
    if (recordingLaunch.isLeadInPending) {
      recordingLaunch.cancelLeadIn();
      return;
    }
    recordingLaunch.handleStartRecording();
  }, [isRecording, recordingLaunch]);

  const handleToggleTakeFolder = useCallback((groupId: string) => {
    setExpandedTakeGroups(groups =>
      groups.includes(groupId)
        ? groups.filter(item => item !== groupId)
        : [...groups, groupId],
    );
  }, []);

  useTransportShortcuts({
    onTogglePlay: handleTogglePlay,
    onReturnToZero: handleReturnToZero,
    onToggleRecord: handleRecordPress,
    onToggleEditor: workspacePanels.toggleEditor,
  });

  return (
    <AppWorkspaceView
      mediaDrop={mediaDrop}
      workspacePanels={workspacePanels}
      projectFiles={projectFiles}
      audioImport={audioImport}
      midiImport={midiImport}
      mediaConsolidation={mediaConsolidation}
      audioDeviceSetup={audioDeviceSetup}
      sampleProviderBrowser={sampleProviderBrowser}
      recordingLaunch={recordingLaunch}
      scrollRefs={scrollRefs}
      state={{
        sidebarWidth, rowHeight: timelineRowHeight, isSettingsOpen, expandedTakeGroups,
        guideTargetId: copilotGuidance.guideTargetId,
        isPlaying, isRecording, canRecord, bpm,
        minBpm: MIN_BPM, maxBpm: MAX_BPM, isMetronomeEnabled,
        timeSignature, masterVolumeDb, masterPan, fxRefreshKey,
        copilotTargets: copilotGuidance.copilotTargets,
      }}
      data={{
        visibleTracks, hiddenTracks, visibleBlocks,
        selectedBlockId, selectedBlockIds, selectedBlock, selectedTrackId, selectedTrack,
      }}
      handlers={{
        onSidebarWidthChange: handleSidebarWidthChange, onRowHeightChange: setTimelineRowHeight,
        onBpmChange: handleBpmChange, onTimeSignatureChange: setTimeSignature,
        onToggleMetronome: () => setMetronomeEnabled(!isMetronomeEnabled),
        onTogglePlay: handleTogglePlay, onReturnToZero: handleReturnToZero, onRecordPress: handleRecordPress,
        onFocusWorkspace: focusWorkspace, onSelectTrack: handleSelectTrack,
        onAddVirtualInstrument: (instrumentId, presetId) =>
          addTrackFromTemplate('virtual_instrument', {instrumentId, presetId}),
        onAddVoiceAudio: addVoiceAudioTrack, onAddDrumMachine: addDrumMachineTrack,
        onMoveTrack: moveTrack, onTrackArchiveChange: setTrackArchived,
        onTrackDisableChange: setTrackDisabled, onToggleMute: toggleTrackMute,
        onToggleSolo: toggleTrackSolo, onToggleRecordArm: toggleTrackRecordArm,
        onTrackInputMonitoringChange: setTrackInputMonitoring, onTrackAutomationModeChange: setTrackAutomationMode,
        onTrackAutomationPointSet: setTrackAutomationPoint,
        onTrackAutomationPointRemove: removeTrackAutomationPoint,
        onTrackAutomationPointCapture: captureTrackAutomationPoint, onTrackVolumeChange: setTrackVolumeDb,
        onTrackPanChange: setTrackPan, onTrackGainChange: setTrackGainDb,
        onMoveBlock: handleMoveBlock, onResizeBlock: resizeBlock, onSelectBlock: handleSelectBlock,
        onUpdateBlock: updateBlock, onDeleteBlock: removeBlock, onRenameMediaSource: setMediaSourceName,
        onDuplicateMediaSource: audioImport.duplicateAudioSource, onCompLooperLayer: compLooperLayer,
        onCompRecordingTake: compRecordingTake, onEditorActiveChange: handleEditorActiveChange,
        onCopilotActions: copilotGuidance.handleCopilotActions, onMasterVolumeChange: setMasterVolumeDb,
        onMasterPanChange: setMasterPan, onOpenFx: openFxWindow, onClearGuide: copilotGuidance.clearGuide,
        onOpenSettings: () => setIsSettingsOpen(true), onCloseSettings: () => setIsSettingsOpen(false),
        onToggleTakeFolder: handleToggleTakeFolder,
      }}
    />
  );
}
