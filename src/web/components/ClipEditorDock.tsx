import React, {useEffect, useMemo} from 'react';

import type {useRecordingLaunch} from '../../hooks/useRecordingLaunch';
import {useEditorTracks} from '../../hooks/useEditorTracks';
import {isDrumPatternBlock} from '../../music/clipFactories';
import {isBottomPanelTrack, isSoftwareInstrumentTrack, useDAWStore} from '../../store/useDAWStore';
import {isLooperOverdubBlock, looperRecordingStatusLabel} from '../../transport/looperOverdub';
import type {SampleLibraryStatus} from '../../native/mediaImportApi';
import {AudioClipEditorPanel} from './AudioClipEditorPanel';
import {PianoRollPanel} from './PianoRollPanel';
import {RecordControls} from './RecordControls';
import {MAX_EDITOR_PANEL_HEIGHT, ResizableEditorPanel} from './ResizableEditorPanel';
import {StepSequencerPanel} from './StepSequencerPanel';

type RecordingLaunch = ReturnType<typeof useRecordingLaunch>;

type ClipEditorDockProps = {
  recordingLaunch: RecordingLaunch;
  editorSuppressed?: boolean;
  sampleLibraryStatus?: SampleLibraryStatus | null;
  onDownloadDrumLibrary?: () => void;
  onEditorActiveChange?: (active: boolean) => void;
  onEditorClose?: () => void;
};

export function ClipEditorDock({
  recordingLaunch,
  editorSuppressed = false,
  onDownloadDrumLibrary,
  onEditorActiveChange,
  onEditorClose,
}: ClipEditorDockProps) {
  const blocks = useDAWStore(state => state.blocks);
  const selectedBlockId = useDAWStore(state => state.selectedBlockId);
  const isRecording = useDAWStore(state => state.isRecording);
  const recordingBlockId = useDAWStore(state => state.recordingBlockId);
  const recordingError = useDAWStore(state => state.recordingError);
  const {armedTrack, activeTrack} = useEditorTracks();
  const recordingBlock = useMemo(
    () => (recordingBlockId ? blocks.find(block => block.id === recordingBlockId) ?? null : null),
    [blocks, recordingBlockId],
  );
  const recordingLabel = useMemo(() => {
    if (!isRecording || !recordingBlock) {
      return undefined;
    }
    const prefix = isLooperOverdubBlock(recordingBlock)
      ? looperRecordingStatusLabel(recordingBlock)
      : 'Recording';
    return `${prefix} · ${Math.max(recordingBlock.lengthBeats, 0.25).toFixed(1)} beats`;
  }, [isRecording, recordingBlock]);
  const selectedMidiBlock = useMemo(
    () =>
      activeTrack && selectedBlockId
        ? blocks.find(block =>
            block.id === selectedBlockId &&
            block.trackId === activeTrack.id &&
            block.type === 'midi',
          ) ?? null
        : null,
    [activeTrack, blocks, selectedBlockId],
  );
  const selectedAudioBlock = useMemo(
    () =>
      activeTrack && selectedBlockId
        ? blocks.find(block =>
            block.id === selectedBlockId &&
            block.trackId === activeTrack.id &&
            block.type === 'audio' &&
            block.id !== recordingBlockId &&
            !isDrumPatternBlock(block),
          ) ?? null
        : null,
    [activeTrack, blocks, recordingBlockId, selectedBlockId],
  );

  const showBottomPanel = activeTrack != null && isBottomPanelTrack(activeTrack) && armedTrack?.type !== 'voice_audio';
  const hasInstrumentEditor =
    Boolean(selectedAudioBlock && activeTrack) ||
    Boolean(showBottomPanel && activeTrack?.type === 'software_instrument') ||
    Boolean(showBottomPanel && activeTrack?.type === 'drum_machine');

  useEffect(() => {
    onEditorActiveChange?.(!editorSuppressed && hasInstrumentEditor);
  }, [editorSuppressed, hasInstrumentEditor, onEditorActiveChange]);

  const showEditors = !editorSuppressed;
  // The stock drum machine is a factory instrument now. Optional sample-library
  // packs can still be downloaded from the browser, but the core editor must not
  // go silent just because an optional `core-drums` pack is missing or stale.
  const isFactoryDrumKitAvailable = true;

  return (
    <>
      {showEditors && selectedAudioBlock && activeTrack ? (
        <ResizableEditorPanel
          panelKey={`audio-${selectedAudioBlock.id}`}
          title={`Audio · ${activeTrack.name}`}
          initialHeight={420}
          onClose={onEditorClose}>
          <AudioClipEditorPanel blockId={selectedAudioBlock.id} trackName={activeTrack.name} />
        </ResizableEditorPanel>
      ) : null}
      {showEditors && showBottomPanel && activeTrack?.type === 'software_instrument' && isSoftwareInstrumentTrack(activeTrack) ? (
        <ResizableEditorPanel
          panelKey={`piano-roll-${activeTrack.id}-${selectedMidiBlock?.id ?? 'empty'}`}
          title={`Piano Roll · ${activeTrack.name}`}
          bodyClassName="piano-roll-editor-body"
          initialHeight={MAX_EDITOR_PANEL_HEIGHT}
          onClose={onEditorClose}>
          <PianoRollPanel blockId={selectedMidiBlock?.id ?? null} track={activeTrack} />
        </ResizableEditorPanel>
      ) : null}
      {showEditors && showBottomPanel && activeTrack?.type === 'drum_machine' ? (
        <ResizableEditorPanel
          panelKey={`drums-${activeTrack.id}`}
          title={`Drums · ${activeTrack.name}`}
          initialHeight={380}
          onClose={onEditorClose}>
          <StepSequencerPanel
            track={activeTrack}
            selectedBlockId={selectedBlockId}
            isDrumLibraryInstalled={isFactoryDrumKitAvailable}
            onDownloadDrumLibrary={onDownloadDrumLibrary}
          />
        </ResizableEditorPanel>
      ) : null}
      {armedTrack ? (
        <RecordControls
          isRecording={isRecording}
          isLeadInPending={recordingLaunch.isLeadInPending}
          countInBeats={recordingLaunch.recordingCountInBeats}
          preRollBeats={recordingLaunch.recordingPreRollBeats}
          latencyCompensationMs={recordingLaunch.recordingLatencyCompensationMs}
          isPunchEnabled={recordingLaunch.isPunchRecordingEnabled}
          isLoopEnabled={recordingLaunch.isLoopRecordingEnabled}
          canPunchRecord={recordingLaunch.canPunchRecord}
          canLoopRecord={recordingLaunch.canLoopRecord}
          trackLabel={armedTrack.name}
          recordingLabel={recordingLabel}
          leadInLabel={recordingLaunch.leadInLabel}
          errorMessage={recordingError}
          onCountInChange={recordingLaunch.setRecordingCountInBeats}
          onPreRollChange={recordingLaunch.setRecordingPreRollBeats}
          onLatencyCompensationChange={recordingLaunch.setRecordingLatencyCompensationMs}
          onPunchEnabledChange={recordingLaunch.setPunchRecordingEnabled}
          onLoopEnabledChange={recordingLaunch.setLoopRecordingEnabled}
        />
      ) : null}
    </>
  );
}
