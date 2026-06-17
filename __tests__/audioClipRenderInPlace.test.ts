import {renderSelectedAudioClipsInPlace} from '../src/arrangement/audioClipRenderInPlace';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWBlock, type DAWTrack} from '../src/store/useDAWStore';

const mockSendNativeAudioCommand = jest.fn();

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: (command: string, payload: unknown) =>
    mockSendNativeAudioCommand(command, payload),
}));

const track: DAWTrack = {
  id: 'track-audio',
  name: 'Voice',
  isMuted: false,
  isSolo: false,
  type: 'voice_audio',
  instrumentId: 'voice_audio',
  presetId: 'voice_audio',
  isRecordArmed: false,
  isLocked: false,
};

function audioBlock(id: string, startBeat: number): DAWBlock {
  return {
    id,
    trackId: track.id,
    name: id,
    startBeat,
    lengthBeats: 2,
    type: 'audio',
    color: '#c45c26',
    audioFilePath: `imports/${id}.wav`,
    absoluteAudioFilePath: `/tmp/${id}.wav`,
  };
}

function resetStore(blocks = [audioBlock('clip-a', 0), audioBlock('clip-b', 2)]): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    tracks: [track],
    patterns: {},
    blocks,
    selectedBlockId: 'clip-b',
    selectedBlockIds: ['clip-a', 'clip-b'],
    selectedTrackId: track.id,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
  });
  resetArrangementHistoryForTests();
}

describe('audio clip render in place', () => {
  beforeEach(() => {
    resetStore();
    mockSendNativeAudioCommand.mockImplementation((command: string) => {
      if (command === 'render_mixdown_async') {
        return JSON.stringify({ok: true, data: {status: 'running'}});
      }
      if (command === 'get_render_mixdown_status') {
        return JSON.stringify({ok: true, data: {status: 'completed'}});
      }
      if (command === 'analyze_audio_file') {
        return JSON.stringify({
          ok: true,
          data: {
            lengthBeats: 4,
            durationSeconds: 2,
            sampleRate: 44100,
            channelCount: 2,
            fileBytes: 4096,
            peakAmplitude: 0.7,
            waveformPeaks: [0.1, 0.3],
          },
        });
      }
      if (command === 'engine_status' || command === 'engine_status_fast') {
        return JSON.stringify({ok: true, data: {sampleRate: 48000}});
      }
      return JSON.stringify({ok: false});
    });
  });

  it('renders selected same-track audio clips and replaces them with one undoable clip', async () => {
    const prepareAudioRender = jest.fn(async () => ({
      ok: true as const,
      originalPath: '/tmp/assets/imports/render.wav',
      absolutePath: '/tmp/assets/imports/render.wav',
      relativePath: 'imports/render.wav',
      name: 'render',
    }));

    const result = await renderSelectedAudioClipsInPlace({
      importAudio: jest.fn(),
      prepareAudioRender,
    });

    expect(result).toMatchObject({ok: true, path: '/tmp/assets/imports/render.wav'});
    expect(prepareAudioRender).toHaveBeenCalledWith({defaultPath: 'clip-a Render.wav'});
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith('render_mixdown_async', expect.objectContaining({
      path: '/tmp/assets/imports/render.wav',
      trackId: 'track-audio',
      startBeat: 0,
      endBeat: 4,
    }));
    expect(mockSendNativeAudioCommand).toHaveBeenCalledWith('analyze_audio_file', {
      absoluteAudioFilePath: '/tmp/assets/imports/render.wav',
    });

    const renderedBlock = useDAWStore.getState().blocks[0]!;
    expect(useDAWStore.getState().blocks).toHaveLength(1);
    expect(renderedBlock).toMatchObject({
      trackId: 'track-audio',
      startBeat: 0,
      lengthBeats: 4,
      audioFilePath: 'imports/render.wav',
      absoluteAudioFilePath: '/tmp/assets/imports/render.wav',
      sourceOffsetBeats: 0,
      mediaValidationWarning: 'Source sample rate 44100 Hz differs from device 48000 Hz.',
    });
    expect(useDAWStore.getState().selectedBlockId).toBe(renderedBlock.id);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual(['clip-a', 'clip-b']);
  });

  it('rejects mixed-track selections before reserving a render path', async () => {
    resetStore([
      audioBlock('clip-a', 0),
      {...audioBlock('clip-b', 2), trackId: 'track-other'},
    ]);
    const prepareAudioRender = jest.fn();

    const result = await renderSelectedAudioClipsInPlace({
      importAudio: jest.fn(),
      prepareAudioRender,
    });

    expect(result).toEqual({
      ok: false,
      error: 'Audio render in place requires clips on one track.',
    });
    expect(prepareAudioRender).not.toHaveBeenCalled();
  });

  it('returns an error without replacing clips when native status is malformed', async () => {
    mockSendNativeAudioCommand.mockImplementation((command: string) => {
      if (command === 'render_mixdown_async') {
        return JSON.stringify({ok: true, data: {status: 'running'}});
      }
      if (command === 'get_render_mixdown_status') {
        return 'not-json';
      }
      return JSON.stringify({ok: true});
    });

    const result = await renderSelectedAudioClipsInPlace({
      importAudio: jest.fn(),
      prepareAudioRender: jest.fn(async () => ({
        ok: true as const,
        originalPath: '/tmp/assets/imports/render.wav',
        absolutePath: '/tmp/assets/imports/render.wav',
        relativePath: 'imports/render.wav',
        name: 'render',
      })),
    });

    expect(result).toEqual({ok: false, error: 'Mixdown export failed.'});
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual(['clip-a', 'clip-b']);
  });

  it('does not replace clips when rendered audio analysis is incomplete', async () => {
    mockSendNativeAudioCommand.mockImplementation((command: string) => {
      if (command === 'render_mixdown_async') {
        return JSON.stringify({ok: true, data: {status: 'running'}});
      }
      if (command === 'get_render_mixdown_status') {
        return JSON.stringify({ok: true, data: {status: 'completed'}});
      }
      if (command === 'analyze_audio_file') {
        return JSON.stringify({ok: true, data: {waveformPeaks: [0.1, 0.2]}});
      }
      return JSON.stringify({ok: true});
    });

    const result = await renderSelectedAudioClipsInPlace({
      importAudio: jest.fn(),
      prepareAudioRender: jest.fn(async () => ({
        ok: true as const,
        originalPath: '/tmp/assets/imports/render.wav',
        absolutePath: '/tmp/assets/imports/render.wav',
        relativePath: 'imports/render.wav',
        name: 'render',
      })),
    });

    expect(result).toEqual({ok: false, error: 'Rendered audio could not be analyzed.'});
    expect(useDAWStore.getState().blocks.map(block => block.id)).toEqual(['clip-a', 'clip-b']);
  });
});
