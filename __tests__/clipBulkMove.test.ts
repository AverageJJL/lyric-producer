import {blocksAfterSelectedClipMove, moveSelectedClipsAsGroup} from '../src/arrangement/clipBulkMove';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const tracks: DAWTrack[] = ['track-1', 'track-2', 'track-3'].map((id, index) => ({
  id,
  name: `Track ${index + 1}`,
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
}));

function block(id: string, trackId: string, startBeat: number, lengthBeats = 2): DAWBlock {
  return {
    id,
    trackId,
    name: id,
    startBeat,
    lengthBeats,
    type: 'midi',
    color: '#4a7fd4',
    notes: [],
  };
}

function resetStore(blocks: DAWBlock[]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks,
    patterns: {},
    blocks,
    selectedBlockId: 'clip-b',
    selectedBlockIds: ['clip-a', 'clip-b'],
    selectedTrackId: 'track-1',
    isRecording: false,
    recordingBlockId: null,
    recordingStartSeconds: null,
    recordingWallClockStart: null,
    recordingError: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    midiAudition: null,
  });
}

test('moves selected clips as one undoable group', () => {
  resetStore([
    block('clip-a', 'track-1', 0),
    block('clip-b', 'track-1', 4),
    block('clip-c', 'track-1', 12),
  ]);

  expect(moveSelectedClipsAsGroup('clip-a', 2, 'track-1')).toBe(true);

  expect(useDAWStore.getState().blocks).toEqual([
    expect.objectContaining({id: 'clip-a', startBeat: 2}),
    expect.objectContaining({id: 'clip-b', startBeat: 6}),
    expect.objectContaining({id: 'clip-c', startBeat: 12}),
  ]);
  expect(useDAWStore.getState().selectedBlockIds).toEqual(['clip-a', 'clip-b']);

  useDAWStore.getState().undo();
  expect(useDAWStore.getState().blocks).toEqual([
    expect.objectContaining({id: 'clip-a', startBeat: 0}),
    expect.objectContaining({id: 'clip-b', startBeat: 4}),
    expect.objectContaining({id: 'clip-c', startBeat: 12}),
  ]);
});

test('preserves relative track rows during selected clip moves', () => {
  const blocks = [
    block('clip-a', 'track-1', 0),
    block('clip-b', 'track-2', 4),
    block('clip-c', 'track-3', 12),
  ];

  const moved = blocksAfterSelectedClipMove({
    blocks,
    trackIds: tracks.map(track => track.id),
    selectedBlockIds: ['clip-a', 'clip-b'],
    anchorBlockId: 'clip-a',
    targetStartBeat: 2,
    targetTrackId: 'track-2',
    maxTimelineBeat: 64,
  });

  expect(moved).toEqual([
    expect.objectContaining({id: 'clip-a', trackId: 'track-2', startBeat: 2}),
    expect.objectContaining({id: 'clip-b', trackId: 'track-3', startBeat: 6}),
    expect.objectContaining({id: 'clip-c', trackId: 'track-3', startBeat: 12}),
  ]);
});

test('moves the group to the nearest non-overlapping beat when obstructed', () => {
  const blocks = [
    block('clip-a', 'track-1', 0),
    block('clip-b', 'track-1', 4),
    block('obstacle', 'track-1', 8),
  ];

  const moved = blocksAfterSelectedClipMove({
    blocks,
    trackIds: tracks.map(track => track.id),
    selectedBlockIds: ['clip-a', 'clip-b'],
    anchorBlockId: 'clip-a',
    targetStartBeat: 4,
    targetTrackId: 'track-1',
    maxTimelineBeat: 64,
  });

  expect(moved).toEqual([
    expect.objectContaining({id: 'clip-a', startBeat: 2}),
    expect.objectContaining({id: 'clip-b', startBeat: 6}),
    expect.objectContaining({id: 'obstacle', startBeat: 8}),
  ]);
});
