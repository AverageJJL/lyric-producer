import {
  finalizedAudioLoopRecordingTakes,
  finalizedMidiLoopRecordingTakes,
} from '../src/transport/loopRecording';
import type {DAWBlock} from '../src/store/useDAWStore';

function midiRecordingBlock(): DAWBlock {
  return {
    id: 'clip-loop',
    trackId: 'track-synth',
    name: 'Recorded',
    startBeat: 4,
    lengthBeats: 8,
    type: 'midi',
    color: '#8aa',
    notes: [
      {note: 60, velocity: 96, startBeat: 0.5, lengthBeats: 0.5},
      {note: 62, velocity: 88, startBeat: 3.75, lengthBeats: 0.5},
      {note: 64, velocity: 90, startBeat: 4.25, lengthBeats: 1},
    ],
  };
}

describe('loop recording takes', () => {
  it('splits loop passes into compable inactive takes over the cycle range', () => {
    const takes = finalizedMidiLoopRecordingTakes(midiRecordingBlock(), {
      cycleStartBeat: 4,
      cycleEndBeat: 8,
    });

    expect(takes).toHaveLength(2);
    expect(takes.map(take => ({
      id: take.id,
      startBeat: take.startBeat,
      lengthBeats: take.lengthBeats,
      groupId: take.recordingTakeGroupId,
      takeId: take.recordingTakeId,
      takeIndex: take.recordingTakeIndex,
      recordingTakeActive: take.recordingTakeActive,
    }))).toEqual([
      {
        id: 'clip-loop',
        startBeat: 4,
        lengthBeats: 4,
        groupId: 'loop:track-synth:clip-loop',
        takeId: 'clip-loop',
        takeIndex: 0,
        recordingTakeActive: false,
      },
      {
        id: 'clip-loop-loop-2',
        startBeat: 4,
        lengthBeats: 4,
        groupId: 'loop:track-synth:clip-loop',
        takeId: 'clip-loop-loop-2',
        takeIndex: 1,
        recordingTakeActive: true,
      },
    ]);
    expect(takes[0]?.notes).toEqual([
      {note: 60, velocity: 96, startBeat: 0.5, lengthBeats: 0.5},
      {note: 62, velocity: 88, startBeat: 3.75, lengthBeats: 0.25},
    ]);
    expect(takes[1]?.notes).toEqual([
      {note: 62, velocity: 88, startBeat: 0, lengthBeats: 0.25},
      {note: 64, velocity: 90, startBeat: 0.25, lengthBeats: 1},
    ]);
  });

  it('splits recorded audio files into loop takes with source offsets', () => {
    const takes = finalizedAudioLoopRecordingTakes({
      id: 'clip-audio-loop',
      trackId: 'track-voice',
      name: 'Recorded',
      startBeat: 4,
      lengthBeats: 10,
      sourceLengthBeats: 10,
      sourceOffsetBeats: 0,
      type: 'audio',
      color: '#8aa',
      audioFilePath: 'recordings/voice.wav',
      absoluteAudioFilePath: '/tmp/voice.wav',
    }, {
      cycleStartBeat: 4,
      cycleEndBeat: 8,
    });

    expect(takes).toHaveLength(3);
    expect(takes.map(take => ({
      id: take.id,
      lengthBeats: take.lengthBeats,
      sourceOffsetBeats: take.sourceOffsetBeats,
      sourceLengthBeats: take.sourceLengthBeats,
      recordingTakeActive: take.recordingTakeActive,
    }))).toEqual([
      {
        id: 'clip-audio-loop',
        lengthBeats: 4,
        sourceOffsetBeats: 0,
        sourceLengthBeats: 10,
        recordingTakeActive: false,
      },
      {
        id: 'clip-audio-loop-loop-2',
        lengthBeats: 4,
        sourceOffsetBeats: 4,
        sourceLengthBeats: 10,
        recordingTakeActive: false,
      },
      {
        id: 'clip-audio-loop-loop-3',
        lengthBeats: 2,
        sourceOffsetBeats: 8,
        sourceLengthBeats: 10,
        recordingTakeActive: true,
      },
    ]);
    expect(takes.map(take => take.startBeat)).toEqual([4, 4, 4]);
  });
});
