import {applyArrangementOperations} from '../src/arrangement/operations';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

const baseTrack: DAWTrack = {
  id: 'track-1',
  name: 'Lead',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
};

const midiBlock: DAWBlock = {
  id: 'clip-1',
  trackId: 'track-1',
  name: 'Motif',
  startBeat: 0,
  lengthBeats: 4,
  type: 'midi',
  color: '#4a7fd4',
  notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
};

function resetStore(overrides: Partial<ReturnType<typeof useDAWStore.getState>> = {}): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    tracks: [baseTrack],
    patterns: {},
    blocks: [],
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    playheadBeat: 0,
    playheadSeconds: 0,
    syncSource: 'ui',
    timeSignature: {numerator: 4, denominator: 4},
    ...overrides,
  });
  resetArrangementHistoryForTests();
}

describe('scripted arrangement operation undo coverage', () => {
  beforeEach(() => {
    resetStore();
  });

  it('undoes a scripted MIDI clip upsert', () => {
    applyArrangementOperations([{
      op: 'upsertMidiClip',
      clip: {
        id: midiBlock.id,
        trackId: midiBlock.trackId,
        name: midiBlock.name,
        startBeat: midiBlock.startBeat,
        lengthBeats: midiBlock.lengthBeats,
        notes: midiBlock.notes!,
      },
    }], {skipNativeRefresh: true});

    expect(useDAWStore.getState().blocks).toHaveLength(1);
    expect(useDAWStore.getState().canUndo()).toBe(true);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks).toEqual([]);
    expect(useDAWStore.getState().tracks).toMatchObject([baseTrack]);
  });

  it('does not create history for unchanged scripted block and pattern upserts', () => {
    const pattern = createEmptyPattern('Beat', 'pattern-1');
    resetStore({blocks: [midiBlock], patterns: {[pattern.id]: pattern}});

    applyArrangementOperations([
      {
        op: 'upsertMidiClip',
        clip: {
          id: midiBlock.id,
          trackId: midiBlock.trackId,
          name: midiBlock.name,
          startBeat: midiBlock.startBeat,
          lengthBeats: midiBlock.lengthBeats,
          notes: midiBlock.notes!,
        },
      },
      {op: 'upsertDrumPattern', pattern},
    ], {skipNativeRefresh: true});

    expect(useDAWStore.getState().canUndo()).toBe(false);
  });

  it('undoes scripted track restore and sampler-slice creation', () => {
    const sourceAudio: DAWBlock = {
      id: 'clip-audio',
      trackId: 'track-1',
      name: 'Break',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#c45c26',
      audioFilePath: 'imports/break.wav',
      sourceLengthBeats: 4,
      durationSeconds: 2,
    };
    resetStore({tracks: [], blocks: [sourceAudio]});

    applyArrangementOperations([{op: 'restoreTrack', track: baseTrack}], {skipNativeRefresh: true});
    expect(useDAWStore.getState().tracks).toMatchObject([baseTrack]);
    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks).toEqual([]);

    applyArrangementOperations([{
      op: 'createSamplerFromSlices',
      sourceClipId: sourceAudio.id,
      trackId: 'track-sampler',
      trackName: 'Break Sampler',
      clipId: 'clip-sampler',
      clipName: 'Chops',
      startBeat: 8,
      slices: [{name: 'Kick', sourceStartBeat: 0, sourceLengthBeats: 0.5, triggerNote: 48}],
    }], {skipNativeRefresh: true});

    expect(useDAWStore.getState().tracks.map(track => track.id)).toEqual(['track-sampler']);
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual([
      'clip-audio',
      'clip-sampler',
    ]);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks).toEqual([]);
    expect(useDAWStore.getState().blocks).toMatchObject([sourceAudio]);
  });
});
