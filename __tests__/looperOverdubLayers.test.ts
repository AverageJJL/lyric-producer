jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

import {
  blocksAfterLooperComp,
  finalizedLooperOverdubSegments,
  looperCompLayers,
  looperLayerCount,
} from '../src/transport/looperOverdub';
import {captureProjectSnapshot} from '../src/arrangement/projectSnapshot';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';
import {DEFAULT_SNAP_GRID} from '../src/ui/snapGrid';

const voiceTrack: DAWTrack = {
  id: 'track-voice',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: true,
  isLocked: false,
};

function audioBlock(id: string, startBeat: number, lengthBeats: number): DAWBlock {
  return {
    id,
    trackId: voiceTrack.id,
    name: id,
    startBeat,
    lengthBeats,
    type: 'audio',
    color: '#888',
    audioFilePath: `imports/${id}.wav`,
    absoluteAudioFilePath: `/tmp/${id}.wav`,
    sourceLengthBeats: lengthBeats,
    sourceOffsetBeats: 0,
  };
}

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [voiceTrack],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
    snapGrid: DEFAULT_SNAP_GRID,
    isRelativeSnapEnabled: false,
    performanceMode: 'linear',
    looperLengthBars: 4,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
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
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

describe('looper overdub layers', () => {
  beforeEach(() => {
    resetStore();
  });

  it('preserves existing clips and splits a wrapped audio overdub into one layer', () => {
    useDAWStore.setState({
      performanceMode: 'looper',
      blocks: [audioBlock('base-loop', 0, 16)],
    });

    const clipId = useDAWStore.getState().startRecordingSession(voiceTrack.id, 15);
    expect(clipId).toBeTruthy();

    const recording = useDAWStore.getState().blocks.find(block => block.id === clipId);
    expect(recording).toMatchObject({
      startBeat: 15,
      looperLayerIndex: 0,
      looperLengthBeats: 16,
    });

    useDAWStore.getState().finalizeRecordingSession({
      audioFilePath: 'imports/wrapped.wav',
      absoluteAudioFilePath: '/tmp/wrapped.wav',
      lengthBeats: 4,
      durationSeconds: 2,
      waveformPeaks: [0.2, 0.4],
    });

    const blocks = useDAWStore.getState().blocks;
    const base = blocks.find(block => block.id === 'base-loop');
    const head = blocks.find(block => block.id === clipId);
    const tail = blocks.find(block => block.id === `${clipId}-wrap`);

    expect(base).toMatchObject({startBeat: 0, lengthBeats: 16});
    expect(head).toMatchObject({
      name: 'Overdub 1',
      startBeat: 15,
      lengthBeats: 1,
      sourceOffsetBeats: 0,
      sourceLengthBeats: 4,
    });
    expect(tail).toMatchObject({
      name: 'Overdub 1',
      startBeat: 0,
      lengthBeats: 3,
      sourceOffsetBeats: 1,
      sourceLengthBeats: 4,
      looperLayerId: head?.looperLayerId,
    });
    expect(looperLayerCount(blocks)).toBe(1);
  });

  it('keeps linear recording overlap trimming unchanged', () => {
    useDAWStore.setState({blocks: [audioBlock('base-loop', 0, 16)]});

    const clipId = useDAWStore.getState().startRecordingSession(voiceTrack.id, 4);
    useDAWStore.getState().finalizeRecordingSession({
      audioFilePath: 'imports/linear.wav',
      absoluteAudioFilePath: '/tmp/linear.wav',
      lengthBeats: 4,
      durationSeconds: 2,
    });

    const blocks = useDAWStore.getState().blocks;
    expect(blocks.find(block => block.id === clipId)).toMatchObject({
      startBeat: 4,
      lengthBeats: 4,
      name: 'Recorded',
    });
    expect(blocks.find(block => block.id === 'base-loop')).toMatchObject({
      startBeat: 0,
      lengthBeats: 4,
    });
    expect(blocks.find(block => block.id === 'base-loop-tail-8')).toMatchObject({
      startBeat: 8,
      lengthBeats: 8,
    });
  });

  it('splits wrapped MIDI notes into loop-local layer segments', () => {
    const block: DAWBlock = {
      id: 'midi-loop',
      trackId: 'track-keys',
      name: 'Overdub 1',
      startBeat: 14,
      lengthBeats: 4,
      type: 'midi',
      color: '#88f',
      notes: [
        {note: 60, velocity: 100, startBeat: 0.5, lengthBeats: 0.5},
        {note: 64, velocity: 100, startBeat: 2.5, lengthBeats: 0.75},
      ],
      looperLayerId: 'looper:track-keys:0',
      looperLayerIndex: 0,
      looperBaseStartBeat: 0,
      looperLengthBeats: 16,
    };

    const [head, tail] = finalizedLooperOverdubSegments(block);
    expect(head).toMatchObject({
      id: 'midi-loop',
      startBeat: 14,
      lengthBeats: 2,
      notes: [{note: 60, startBeat: 0.5, lengthBeats: 0.5}],
    });
    expect(tail).toMatchObject({
      id: 'midi-loop-wrap',
      startBeat: 0,
      lengthBeats: 2,
      notes: [{note: 64, startBeat: 0.5, lengthBeats: 0.75}],
    });
  });

  it('keeps looper layer metadata in project snapshots', () => {
    const block = {
      ...audioBlock('snapshot-layer', 0, 16),
      looperLayerId: 'looper:track-voice:0',
      looperLayerIndex: 0,
      looperBaseStartBeat: 0,
      looperLengthBeats: 16,
    };
    useDAWStore.setState({
      performanceMode: 'looper',
      blocks: [block],
    });

    const snapshot = captureProjectSnapshot();
    expect(snapshot.blocks[0]).toMatchObject({
      looperLayerId: 'looper:track-voice:0',
      looperLayerIndex: 0,
      looperBaseStartBeat: 0,
      looperLengthBeats: 16,
    });
  });

  it('comps one layer by muting sibling looper layers on the same track', () => {
    const layerA = {
      ...audioBlock('layer-a', 0, 16),
      looperLayerId: 'looper:track-voice:0',
      looperLayerIndex: 0,
      looperLengthBeats: 16,
    };
    const layerB = {
      ...audioBlock('layer-b', 0, 16),
      looperLayerId: 'looper:track-voice:1',
      looperLayerIndex: 1,
      looperLengthBeats: 16,
      isMuted: true,
    };
    const otherTrack = {
      ...audioBlock('layer-other', 0, 16),
      trackId: 'other-track',
      looperLayerId: 'looper:other-track:0',
      looperLayerIndex: 0,
      looperLengthBeats: 16,
    };

    const blocks = blocksAfterLooperComp([layerA, layerB, otherTrack], 'looper:track-voice:1');
    expect(blocks.find(block => block.id === 'layer-a')?.isMuted).toBe(true);
    expect(blocks.find(block => block.id === 'layer-b')?.isMuted).toBeUndefined();
    expect(blocks.find(block => block.id === 'layer-other')?.isMuted).toBeUndefined();
    expect(looperCompLayers(blocks).find(layer => layer.layerId === 'looper:track-voice:1'))
      .toMatchObject({name: 'Overdub 2', isActive: true});
  });

  it('compLooperLayer records one undoable store mutation', () => {
    useDAWStore.setState({
      performanceMode: 'looper',
      blocks: [
        {
          ...audioBlock('layer-a', 0, 16),
          looperLayerId: 'looper:track-voice:0',
          looperLayerIndex: 0,
          looperLengthBeats: 16,
        },
        {
          ...audioBlock('layer-b', 0, 16),
          looperLayerId: 'looper:track-voice:1',
          looperLayerIndex: 1,
          looperLengthBeats: 16,
          isMuted: true,
        },
      ],
    });

    useDAWStore.getState().compLooperLayer('looper:track-voice:1');
    expect(useDAWStore.getState().blocks.map(block => block.isMuted)).toEqual([true, undefined]);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks.map(block => block.isMuted)).toEqual([undefined, true]);
  });
});
