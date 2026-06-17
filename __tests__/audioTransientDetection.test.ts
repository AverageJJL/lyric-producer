import {
  detectAudioTransients,
  parseTransientDetectionResponse,
  transientSlicesForAudioBlock,
} from '../src/native/audioTransientDetection';
import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import type {DAWBlock} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

function audioBlock(): DAWBlock {
  return {
    id: 'clip-audio',
    trackId: 'track-audio',
    name: 'Loop',
    startBeat: 0,
    lengthBeats: 4,
    type: 'audio',
    color: '#c45c26',
    sourceOffsetBeats: 2,
    audioFilePath: 'imports/loop.wav',
  };
}

describe('audio transient detection bridge', () => {
  beforeEach(() => mockedSend.mockReset());

  it('parses native transient detection responses', () => {
    const response = JSON.stringify({
      ok: true,
      data: {
        absoluteAudioFilePath: '/tmp/loop.wav',
        durationSeconds: 2,
        bpm: 120,
        slices: [
          {
            name: 'Slice 1',
            sourceStartSeconds: 1,
            sourceLengthSeconds: 0.25,
            sourceStartBeat: 2,
            sourceLengthBeats: 0.5,
            triggerNote: 48,
            velocity: 96,
          },
        ],
      },
    });

    expect(parseTransientDetectionResponse(response)?.slices[0]).toMatchObject({
      name: 'Slice 1',
      sourceStartBeat: 2,
      triggerNote: 48,
    });
  });

  it('calls the native detector with bounded metadata options', () => {
    mockedSend.mockReturnValue(JSON.stringify({
      ok: true,
      data: {absoluteAudioFilePath: '/tmp/loop.wav', durationSeconds: 1, bpm: 120, slices: []},
    }));

    expect(detectAudioTransients('/tmp/loop.wav', {maxSlices: 4, threshold: 0.1})).toMatchObject({
      absoluteAudioFilePath: '/tmp/loop.wav',
    });
    expect(mockedSend).toHaveBeenCalledWith('detect_audio_transients', {
      absoluteAudioFilePath: '/tmp/loop.wav',
      maxSlices: 4,
      threshold: 0.1,
    });
  });

  it('maps source-file transient beats into clip-local sampler slice intents', () => {
    const detection = parseTransientDetectionResponse(JSON.stringify({
      ok: true,
      data: {
        absoluteAudioFilePath: '/tmp/loop.wav',
        durationSeconds: 3,
        bpm: 120,
        slices: [
          {
            name: 'Before trim',
            sourceStartSeconds: 0.5,
            sourceLengthSeconds: 0.2,
            sourceStartBeat: 1,
            sourceLengthBeats: 0.4,
            triggerNote: 48,
            velocity: 90,
          },
          {
            name: 'In clip',
            sourceStartSeconds: 1,
            sourceLengthSeconds: 0.25,
            sourceStartBeat: 3,
            sourceLengthBeats: 0.5,
            triggerNote: 49,
            velocity: 100,
          },
        ],
      },
    }))!;

    expect(transientSlicesForAudioBlock(audioBlock(), detection)).toEqual([{
      name: 'In clip',
      sourceStartBeat: 1,
      sourceLengthBeats: 0.5,
      triggerNote: 49,
      velocity: 100,
      clipStartBeat: 1,
      clipLengthBeats: 0.5,
    }]);
  });
});
