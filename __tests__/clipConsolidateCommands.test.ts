import {consolidateSelectedMidiClips} from '../src/arrangement/clipEditCommands';
import {isConsolidateShortcut, isGlueShortcut} from '../src/hooks/useUndoRedoShortcuts';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const track: DAWTrack = {
  id: 'track-1',
  name: 'Keys',
  isMuted: false,
  isSolo: false,
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isRecordArmed: false,
  isLocked: false,
};

function midiBlock(updates?: Partial<DAWBlock>): DAWBlock {
  return {
    id: 'clip-a',
    trackId: track.id,
    name: 'Lead',
    startBeat: 0,
    lengthBeats: 2,
    type: 'midi',
    color: '#4a7fd4',
    notes: [{note: 60, velocity: 90, startBeat: 0.5, lengthBeats: 1}],
    ...updates,
  };
}

function resetStore(blocks: DAWBlock[], selectedBlockIds: string[]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [track],
    patterns: {},
    blocks,
    selectedBlockId: selectedBlockIds[selectedBlockIds.length - 1] ?? null,
    selectedBlockIds,
    selectedTrackId: track.id,
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

test('consolidates selected MIDI clips into one continuous clip with one undo step', () => {
  resetStore([
    midiBlock({id: 'clip-a', startBeat: 0, lengthBeats: 2}),
    midiBlock({
      id: 'clip-b',
      startBeat: 4,
      lengthBeats: 2,
      notes: [{note: 67, velocity: 70, startBeat: 0, lengthBeats: 1}],
    }),
  ], ['clip-a', 'clip-b']);

  expect(consolidateSelectedMidiClips()).toBe(true);

  const state = useDAWStore.getState();
  expect(state.blocks).toHaveLength(1);
  expect(state.blocks[0]).toMatchObject({
    name: 'Lead Consolidated',
    startBeat: 0,
    lengthBeats: 6,
  });
  expect(state.blocks[0]!.id).toContain('clip-a-consolidated');
  expect(state.blocks[0]!.notes).toEqual([
    {note: 60, velocity: 90, startBeat: 0.5, lengthBeats: 1},
    {note: 67, velocity: 70, startBeat: 4, lengthBeats: 1},
  ]);
  expect(state.selectedBlockIds).toEqual([state.blocks[0]!.id]);

  state.undo();
  expect(useDAWStore.getState().blocks).toHaveLength(2);
});

test('does not consolidate mixed audio and MIDI selections', () => {
  resetStore([
    midiBlock({id: 'clip-a'}),
    midiBlock({id: 'clip-audio', type: 'audio', notes: undefined}),
  ], ['clip-a', 'clip-audio']);

  expect(consolidateSelectedMidiClips()).toBe(false);
  expect(useDAWStore.getState().blocks).toHaveLength(2);
});

test('uses shift-modified glue shortcut for consolidate', () => {
  const event = {metaKey: true, ctrlKey: false, shiftKey: true, key: 'j'};

  expect(isConsolidateShortcut(event)).toBe(true);
  expect(isGlueShortcut(event)).toBe(false);
});
