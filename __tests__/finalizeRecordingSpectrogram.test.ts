jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {useDAWStore} from '../src/store/useDAWStore';

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

function resetStore() {
  useDAWStore.setState({
    tracks: [],
    blocks: [],
    patterns: {},
    isRecording: false,
    recordingBlockId: null,
  });
}

describe('finalizeRecordingSession spectrogram trigger', () => {
  beforeEach(() => {
    resetStore();
    mockedSend.mockReset();
    mockedSend.mockReturnValue(JSON.stringify({ok: true, data: {status: 'started'}}));
  });

  it('dispatches render_spectrogram after voice WAV finalize', () => {
    const clipId = 'voice-clip-1';
    useDAWStore.setState({
      recordingBlockId: clipId,
      blocks: [
        {
          id: clipId,
          trackId: 'track-voice',
          name: 'Recording',
          startBeat: 0,
          lengthBeats: 4,
          type: 'audio',
          color: '#888',
        },
      ],
    });

    useDAWStore.getState().finalizeRecordingSession({
      audioFilePath: 'recordings/voice-clip-1.wav',
      absoluteAudioFilePath: '/tmp/recordings/voice-clip-1.wav',
      lengthBeats: 4,
      durationSeconds: 2,
      waveformPeaks: [0.1, 0.5],
    });

    const renderCall = mockedSend.mock.calls.find(call => call[0] === 'render_spectrogram');
    expect(renderCall).toBeDefined();
    expect(renderCall?.[1]).toMatchObject({
      audioPath: 'recordings/voice-clip-1.wav',
      source: 'recorded_wav',
      width: 512,
      height: 256,
    });

    const block = useDAWStore.getState().blocks.find(item => item.id === clipId);
    expect(block?.spectrogramRequestId).toMatch(/^spec-/);
  });

  it('does not dispatch for MIDI-only finalize', () => {
    const clipId = 'midi-clip-1';
    useDAWStore.setState({
      recordingBlockId: clipId,
      blocks: [
        {
          id: clipId,
          trackId: 'track-keys',
          name: 'Recording',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#888',
          notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
        },
      ],
    });

    useDAWStore.getState().finalizeRecordingSession([
      {note: 60, velocity: 100, startBeat: 0, lengthBeats: 1},
    ]);

    const renderCall = mockedSend.mock.calls.find(call => call[0] === 'render_spectrogram');
    expect(renderCall).toBeUndefined();
  });
});

describe('applySpectrogramReady', () => {
  beforeEach(() => {
    resetStore();
  });

  it('stores png path on matching request id', () => {
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: 't1',
          name: 'Recorded',
          startBeat: 0,
          lengthBeats: 4,
          type: 'audio',
          color: '#888',
          spectrogramRequestId: 'spec-match',
        },
      ],
    });

    useDAWStore.getState().applySpectrogramReady({
      requestId: 'spec-match',
      pngPath: 'spectrograms/clip-1.png',
      ok: true,
    });

    const block = useDAWStore.getState().blocks[0];
    expect(block.spectrogramPngPath).toBe('spectrograms/clip-1.png');
    expect(block.spectrogramRequestId).toBeUndefined();
    expect(block.spectrogramError).toBeUndefined();
  });

  it('stores error on failure', () => {
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-1',
          trackId: 't1',
          name: 'Recorded',
          startBeat: 0,
          lengthBeats: 4,
          type: 'audio',
          color: '#888',
          spectrogramRequestId: 'spec-fail',
        },
      ],
    });

    useDAWStore.getState().applySpectrogramReady({
      requestId: 'spec-fail',
      pngPath: '',
      ok: false,
      error: 'decode failed',
    });

    const block = useDAWStore.getState().blocks[0];
    expect(block.spectrogramError).toBe('decode failed');
    expect(block.spectrogramRequestId).toBeUndefined();
  });
});
