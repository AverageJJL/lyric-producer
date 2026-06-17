import {applyArrangementOperations} from '../src/arrangement/operations';
import {createEmptyPattern} from '../src/music/drumPatterns';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

describe('applyArrangementOperations', () => {
  beforeEach(() => {
    useDAWStore.setState({
      isPlaying: false,
      bpm: 120,
      tracks: [],
      patterns: {},
      blocks: [],
      performanceMode: 'linear',
      looperLengthBars: 4,
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedTrackId: null,
      isRecording: false,
      recordingBlockId: null,
      recordingStartSeconds: null,
      recordingWallClockStart: null,
      recordingError: null,
      playheadBeat: 0,
      playheadSeconds: 0,
      playheadOwnedByUser: false,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      syncSource: 'ui',
      timeSignature: {numerator: 4, denominator: 4},
      scale: null,
      chord: null,
      sections: [],
      midiAudition: null,
    });
  });

  it('creates tracks and midi clips deterministically', () => {
    const first = applyArrangementOperations(
      [
        {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-a',
            trackId: useDAWStore.getState().tracks[0]?.id ?? 'missing',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
      ],
      {skipNativeRefresh: true},
    );

    const trackId = first.tracks[0]?.id;
    expect(first.tracks).toHaveLength(1);
    expect(first.blocks).toHaveLength(1);
    expect(first.blocks[0]?.notes).toHaveLength(1);

    const second = applyArrangementOperations(
      [
        {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-a',
            trackId: trackId ?? 'missing',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
      ],
      {skipNativeRefresh: true},
    );

    expect(captureProjectSnapshot().blocks[0]?.notes).toEqual(second.blocks[0]?.notes);
  });

  it('quantizes upsertMidiClip notes to the project grid', () => {
    applyArrangementOperations(
      [
        {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-quantized',
            trackId: useDAWStore.getState().tracks[0]?.id ?? 'missing',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 60, velocity: 100, startBeat: 0.13, lengthBeats: 0.5}],
          },
        },
      ],
      {skipNativeRefresh: true},
    );

    const note = useDAWStore.getState().blocks.find(block => block.id === 'clip-quantized')?.notes?.[0];
    expect(note?.startBeat).toBe(0.25);
  });

  it('applies looper performance mode operations', () => {
    const snapshot = applyArrangementOperations(
      [{op: 'setPerformanceMode', mode: 'looper', looperLengthBars: 8}],
      {skipNativeRefresh: true},
    );

    expect(snapshot).toMatchObject({
      performanceMode: 'looper',
      looperLengthBars: 8,
    });
    expect(useDAWStore.getState()).toMatchObject({
      performanceMode: 'looper',
      looperLengthBars: 8,
    });
  });

  it('upserts drum patterns and pattern-referencing clips', () => {
    applyArrangementOperations(
      [{op: 'createTrack', templateId: 'drum_machine'}],
      {skipNativeRefresh: true},
    );

    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeDefined();

    const pattern = {
      id: 'pat-script',
      name: 'Pattern A',
      steps: createEmptyPattern('Pattern A', 'pat-script').steps,
    };
    pattern.steps.kick[0] = true;

    const snapshot = applyArrangementOperations(
      [
        {op: 'upsertDrumPattern', pattern},
        {
          op: 'upsertDrumClip',
          clip: {
            id: 'clip-drums',
            trackId: trackId!,
            name: 'Pattern A',
            startBeat: 0,
            lengthBeats: 8,
            patternId: 'pat-script',
          },
        },
      ],
      {skipNativeRefresh: true},
    );

    expect(snapshot.patterns['pat-script']?.steps.kick[0]).toBe(true);
    expect(snapshot.blocks.length).toBeGreaterThanOrEqual(1);
    const scripted = snapshot.blocks.find(block => block.id === 'clip-drums');
    expect(scripted?.patternId).toBe('pat-script');
    expect(scripted?.lengthBeats).toBe(8);
  });

  it('no-ops AI/scripted mutations against locked tracks', () => {
    applyArrangementOperations(
      [
        {
          op: 'createTrack',
          templateId: 'virtual_instrument',
          trackId: 'track-locked',
          instrumentId: 'synth_lead',
          presetId: 'pop_lead',
        },
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-locked-track',
            trackId: 'track-locked',
            name: 'Lead',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
        {op: 'setTrackLocked', trackId: 'track-locked', isLocked: true},
      ],
      {skipNativeRefresh: true},
    );

    applyArrangementOperations(
      [
        {op: 'setTrackPreset', trackId: 'track-locked', presetId: 'pluck_bright'},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-new',
            trackId: 'track-locked',
            name: 'Should Not Land',
            startBeat: 4,
            lengthBeats: 4,
            notes: [{note: 72, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
        {op: 'deleteTrack', trackId: 'track-locked'},
      ],
      {skipNativeRefresh: true},
    );

    const snapshot = captureProjectSnapshot();
    expect(snapshot.tracks).toEqual([
      expect.objectContaining({
        id: 'track-locked',
        presetId: 'pop_lead',
        isLocked: true,
      }),
    ]);
    expect(snapshot.blocks.map(block => block.id)).toEqual(['clip-locked-track']);
  });

  it('stores clip locks and no-ops mutations against locked clips', () => {
    applyArrangementOperations(
      [
        {op: 'createTrack', templateId: 'virtual_instrument', trackId: 'track-open'},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-locked',
            trackId: 'track-open',
            name: 'Locked Motif',
            startBeat: 0,
            lengthBeats: 4,
            notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
        {op: 'setClipLocked', clipId: 'clip-locked', isLocked: true},
      ],
      {skipNativeRefresh: true},
    );

    applyArrangementOperations(
      [
        {op: 'moveClip', clipId: 'clip-locked', startBeat: 8},
        {op: 'resizeClip', clipId: 'clip-locked', startBeat: 0, lengthBeats: 2},
        {
          op: 'upsertMidiClip',
          clip: {
            id: 'clip-locked',
            trackId: 'track-open',
            name: 'Overwrite Attempt',
            startBeat: 8,
            lengthBeats: 2,
            notes: [{note: 72, velocity: 100, startBeat: 0, lengthBeats: 1}],
          },
        },
        {op: 'deleteClip', clipId: 'clip-locked'},
      ],
      {skipNativeRefresh: true},
    );

    const locked = captureProjectSnapshot().blocks.find(block => block.id === 'clip-locked');
    expect(locked).toMatchObject({
      name: 'Locked Motif',
      startBeat: 0,
      lengthBeats: 4,
      isLocked: true,
    });

    applyArrangementOperations(
      [
        {op: 'setClipLocked', clipId: 'clip-locked', isLocked: false},
        {op: 'deleteClip', clipId: 'clip-locked'},
      ],
      {skipNativeRefresh: true},
    );

    expect(captureProjectSnapshot().blocks).toEqual([]);
  });
});
