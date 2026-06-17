import type {
  ProjectFileBridge,
  ProjectFileStemDestinationTrack,
} from '../native/projectFileApi';
import {midiBytesToBase64, midiFileBytesFromSnapshot} from '../music/midiFileExport';
import {useDAWStore} from '../store/useDAWStore';
import {normalizeCycleRange} from '../transport/cycleRange';
import {canceledExportResult, isExportCanceled} from './projectExportCancellation';
import {safeExportFileName} from './projectExportFileNames';
import {renderNativeMixdown} from './projectNativeMixdownRender';
import {reportExportProgress, type ProjectExportActionOptions} from './projectExportProgress';
import {captureProjectSnapshot} from './projectSnapshot';

export type ProjectExportActionResult =
  | {ok: true; path?: string; paths?: string[]}
  | {ok: false; error: string; canceled?: boolean};

export type MidiExportMode = 'all' | 'selected' | 'cycle';

const BOUNDED_RENDER_TAIL_BEATS = 2;

export async function exportCurrentMixdown(
  bridge: ProjectFileBridge | null,
  options: ProjectExportActionOptions = {},
): Promise<ProjectExportActionResult> {
  if (!bridge) {
    return {ok: false, error: 'Project file bridge is unavailable.'};
  }

  reportExportProgress(options, 'Choosing mixdown destination');
  const destination = await bridge.exportMixdown();
  if (!destination.ok) {
    return destination;
  }
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }

  return renderNativeMixdown(destination.path, undefined, options, 'Rendering mixdown');
}

export async function exportCycleRangeMixdown(
  bridge: ProjectFileBridge | null,
  options: ProjectExportActionOptions = {},
): Promise<ProjectExportActionResult> {
  if (!bridge) {
    return {ok: false, error: 'Project file bridge is unavailable.'};
  }

  const state = useDAWStore.getState();
  if (!state.isCycleEnabled) {
    return {ok: false, error: 'Enable Cycle before exporting a selected range.'};
  }

  const range = normalizeCycleRange(state.cycleStartBeat, state.cycleEndBeat);
  reportExportProgress(options, 'Choosing cycle export destination');
  const destination = await bridge.exportMixdown({
    title: 'Export Cycle Range',
    defaultPath: 'Cycle Mixdown.wav',
  });
  if (!destination.ok) {
    return destination;
  }
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }

  return renderNativeMixdown(
    destination.path,
    {...range, tailBeats: BOUNDED_RENDER_TAIL_BEATS},
    options,
    'Rendering cycle range',
  );
}

export async function exportSelectedClipRender(
  bridge: ProjectFileBridge | null,
  options: ProjectExportActionOptions = {},
): Promise<ProjectExportActionResult> {
  if (!bridge) {
    return {ok: false, error: 'Project file bridge is unavailable.'};
  }

  const state = useDAWStore.getState();
  const selectedBlock = state.selectedBlockId
    ? state.blocks.find(block => block.id === state.selectedBlockId)
    : null;
  if (!selectedBlock) {
    return {ok: false, error: 'Select a clip before exporting a clip render.'};
  }

  const track = state.tracks.find(item => item.id === selectedBlock.trackId);
  if (!track) {
    return {ok: false, error: 'Selected clip track is unavailable.'};
  }
  if (selectedBlock.lengthBeats <= 0) {
    return {ok: false, error: 'Selected clip has no renderable length.'};
  }

  reportExportProgress(options, 'Choosing clip render destination');
  const destination = await bridge.exportMixdown({
    title: 'Export Selected Clip',
    defaultPath: safeExportFileName(`${selectedBlock.name} Clip`, 'Selected Clip'),
  });
  if (!destination.ok) {
    return destination;
  }
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }

  return renderNativeMixdown(destination.path, {
    trackId: track.id,
    startBeat: selectedBlock.startBeat,
    endBeat: selectedBlock.startBeat + selectedBlock.lengthBeats,
    tailBeats: BOUNDED_RENDER_TAIL_BEATS,
  }, options, `Rendering clip: ${selectedBlock.name}`);
}

function currentStemTracks(): ProjectFileStemDestinationTrack[] {
  return useDAWStore.getState().tracks.map(track => ({
    trackId: track.id,
    name: track.name,
  }));
}

export async function exportProjectStems(
  bridge: ProjectFileBridge | null,
  options: ProjectExportActionOptions = {},
): Promise<ProjectExportActionResult> {
  if (!bridge?.exportStems) {
    return {ok: false, error: 'Stem export bridge is unavailable.'};
  }

  const state = useDAWStore.getState();
  const tracks = currentStemTracks();
  if (tracks.length === 0) {
    return {ok: false, error: 'Project has no tracks to export as stems.'};
  }

  reportExportProgress(options, 'Choosing stem export folder');
  const destination = await bridge.exportStems({
    title: 'Export Stems',
    defaultPath: 'Stems',
    tracks,
  });
  if (!destination.ok) {
    return destination;
  }
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }

  const range = state.isCycleEnabled
    ? normalizeCycleRange(state.cycleStartBeat, state.cycleEndBeat)
    : undefined;
  const paths: string[] = [];
  for (const [index, stem] of destination.stems.entries()) {
    if (isExportCanceled(options)) {
      return canceledExportResult();
    }
    const trackName = tracks.find(track => track.trackId === stem.trackId)?.name ?? stem.trackId;
    const target = range
      ? {...range, trackId: stem.trackId, tailBeats: BOUNDED_RENDER_TAIL_BEATS}
      : {trackId: stem.trackId};
    const result = await renderNativeMixdown(
      stem.path,
      target,
      options,
      `Rendering stem ${index + 1}/${destination.stems.length}: ${trackName}`,
    );
    if (!result.ok) {
      if (result.canceled) {
        return result;
      }
      return {ok: false, error: `Stem export failed for ${stem.trackId}: ${result.error}`};
    }
    if (isExportCanceled(options)) {
      return canceledExportResult();
    }
    reportExportProgress(options, `Rendered stem ${index + 1}/${destination.stems.length}`, index + 1, destination.stems.length);
    paths.push(stem.path);
  }

  return {ok: true, path: destination.directoryPath, paths};
}

function selectedMidiBlockIds(): string[] {
  const state = useDAWStore.getState();
  const selectedIds = state.selectedBlockIds.length > 0
    ? state.selectedBlockIds
    : state.selectedBlockId ? [state.selectedBlockId] : [];
  const selected = new Set(selectedIds);
  return state.blocks
    .filter(block => selected.has(block.id) && block.type === 'midi')
    .map(block => block.id);
}

function midiExportRequest(mode: MidiExportMode) {
  const snapshot = captureProjectSnapshot();
  const state = useDAWStore.getState();
  if (mode === 'selected') {
    const blockIds = selectedMidiBlockIds();
    return {
      bytes: blockIds.length > 0
        ? midiFileBytesFromSnapshot(snapshot, {blockIds, shiftToStart: true})
        : null,
      defaultPath: 'Selected MIDI.mid',
      error: blockIds.length > 0
        ? 'Selected MIDI clips have no notes to export.'
        : 'Select one or more MIDI clips before exporting selected MIDI.',
    };
  }

  if (mode === 'cycle') {
    if (!state.isCycleEnabled) {
      return {
        bytes: null,
        defaultPath: 'Cycle MIDI.mid',
        error: 'Enable Cycle before exporting cycle MIDI.',
      };
    }
    const range = normalizeCycleRange(state.cycleStartBeat, state.cycleEndBeat);
    return {
      bytes: midiFileBytesFromSnapshot(snapshot, {range, shiftToStart: true}),
      defaultPath: 'Cycle MIDI.mid',
      error: 'Cycle range has no MIDI notes to export.',
    };
  }

  return {
    bytes: midiFileBytesFromSnapshot(snapshot),
    defaultPath: undefined,
    error: 'Project has no MIDI clips to export.',
  };
}

export async function exportCurrentMidi(
  bridge: ProjectFileBridge | null,
  mode: MidiExportMode = 'all',
  options: ProjectExportActionOptions = {},
): Promise<ProjectExportActionResult> {
  if (!bridge?.writeMidiFile) {
    return {ok: false, error: 'MIDI export bridge is unavailable.'};
  }

  reportExportProgress(options, 'Preparing MIDI export');
  const {bytes, defaultPath, error} = midiExportRequest(mode);
  if (!bytes) {
    return {ok: false, error};
  }

  const base64 = midiBytesToBase64(bytes);
  if (isExportCanceled(options)) {
    return canceledExportResult();
  }
  reportExportProgress(options, 'Writing MIDI file');
  return bridge.writeMidiFile(defaultPath ? {base64, defaultPath} : {base64});
}
