import {createTrackFromTemplate} from '../music/trackTemplates';
import {syncTracksToEngine, upsertBlockForEngine} from '../native/refreshPlayback';
import {
  captureArrangementHistorySnapshot,
  recordArrangementHistory,
} from '../store/history';
import {useDAWStore, defaultTrackColor, type DAWBlock} from '../store/useDAWStore';
import type {ImportedMidiTrack} from '../music/midiFileImport';

let importSequence = 0;

function nextImportClipId(): string {
  importSequence += 1;
  return `clip-midi-import-${Date.now()}-${importSequence}`;
}

export function importMidiTracksAtPlayhead(
  tracks: ImportedMidiTrack[],
  sourceName: string,
): boolean {
  const validTracks = tracks.filter(track => track.notes.length > 0);
  if (validTracks.length === 0) {
    return false;
  }

  const state = useDAWStore.getState();
  const startBeat = state.playheadBeat;
  const laneOffset = state.tracks.length;
  const createdTracks = validTracks.map((track, index) =>
    createTrackFromTemplate('virtual_instrument', laneOffset + index, {
      name: track.name || sourceName || `MIDI ${index + 1}`,
    }),
  );
  const blocks: DAWBlock[] = validTracks.map((track, index) => ({
    id: nextImportClipId(),
    trackId: createdTracks[index]!.id,
    name: track.name || sourceName || 'Imported MIDI',
    startBeat,
    lengthBeats: track.lengthBeats,
    type: 'midi',
    color: defaultTrackColor(laneOffset + index),
    notes: track.notes.map(note => ({...note})),
  }));
  const nextTracks = [...state.tracks, ...createdTracks];

  recordArrangementHistory(captureArrangementHistorySnapshot(state));
  useDAWStore.setState(current => ({
    tracks: nextTracks,
    blocks: [...current.blocks, ...blocks],
    selectedTrackId: createdTracks[createdTracks.length - 1]?.id ?? current.selectedTrackId,
    selectedBlockId: blocks[blocks.length - 1]?.id ?? current.selectedBlockId,
    selectedBlockIds: blocks.map(block => block.id),
    syncSource: 'ui',
  }));
  syncTracksToEngine(nextTracks);
  blocks.forEach(upsertBlockForEngine);
  return true;
}
