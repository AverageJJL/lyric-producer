import {buildSamplerSlicesFromAudioBlock} from '../src/music/samplerSlicing';
import type {DAWBlock} from '../src/store/useDAWStore';

function audioBlock(): DAWBlock {
  return {
    id: 'clip-source',
    trackId: 'track-audio',
    name: 'Break',
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#c45c26',
    audioFilePath: 'imports/break.wav',
    sourceOffsetBeats: 2,
    sourceLengthBeats: 8,
    durationSeconds: 4,
  };
}

describe('sampler slicing', () => {
  it('turns clip-local slice windows into native sampler regions and MIDI triggers', () => {
    const result = buildSamplerSlicesFromAudioBlock(audioBlock(), 120, [
      {
        name: 'Kick chop',
        sourceStartBeat: 1,
        sourceLengthBeats: 0.5,
        triggerNote: 60,
        velocity: 110,
        clipStartBeat: 0.25,
        clipLengthBeats: 0.25,
        gainDb: -3,
      },
    ]);

    expect(result?.regions).toEqual([{
      name: 'Kick chop',
      relativePath: 'imports/break.wav',
      rootNote: 60,
      minNote: 60,
      maxNote: 60,
      gainDb: -3,
      sourceStartSeconds: 1.5,
      sourceEndSeconds: 1.75,
    }]);
    expect(result?.notes).toEqual([
      {note: 60, velocity: 110, startBeat: 0.25, lengthBeats: 0.25},
    ]);
  });
});
