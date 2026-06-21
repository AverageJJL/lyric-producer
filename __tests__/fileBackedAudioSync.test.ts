import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../src/native/NativeAudioEngine';
import {upsertBlockForEngine} from '../src/native/refreshPlayback';
import {useDAWStore, type DAWBlock} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
  sendNativeAudioCommandAsync: jest.fn(() => Promise.resolve('{"ok":true}')),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
const mockedSendAsync = sendNativeAudioCommandAsync as jest.MockedFunction<
  typeof sendNativeAudioCommandAsync
>;

describe('file-backed audio sync', () => {
  beforeEach(() => {
    mockedSend.mockClear();
    mockedSendAsync.mockClear();
    useDAWStore.setState({tracks: []});
  });

  it('sends imported audio file paths to the native upsert command', () => {
    const block: DAWBlock = {
      id: 'clip-import',
      trackId: 'track-audio',
      name: 'Loop',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#4a7fd4',
      sourceLengthBeats: 8,
      sourceOffsetBeats: 1.5,
      clipGainDb: -6,
      fadeInBeats: 0.5,
      fadeOutBeats: 1,
      isReversed: true,
      audioFilePath: 'imports/loop.wav',
      absoluteAudioFilePath: '/tmp/imports/loop.wav',
    };

    upsertBlockForEngine(block);

    expect(mockedSend).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
    expect(mockedSendAsync).toHaveBeenCalledWith(
      'upsert_audio_clip',
      expect.objectContaining({
        clipId: 'clip-import',
        sourceLengthBeats: 8,
        sourceOffsetBeats: 1.5,
        clipGainDb: -6,
        fadeInBeats: 0.5,
        fadeOutBeats: 1,
        isReversed: true,
        audioFilePath: 'imports/loop.wav',
        absoluteAudioFilePath: '/tmp/imports/loop.wav',
      }),
    );
  });

  it('removes muted audio clips from native playback without dropping project state', () => {
    const block: DAWBlock = {
      id: 'clip-muted',
      trackId: 'track-audio',
      name: 'Muted Loop',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#4a7fd4',
      sourceLengthBeats: 4,
      sourceOffsetBeats: 0,
      isMuted: true,
      audioFilePath: 'imports/muted.wav',
      absoluteAudioFilePath: '/tmp/imports/muted.wav',
    };

    upsertBlockForEngine(block);

    expect(mockedSend).toHaveBeenCalledWith('delete_clip', {clipId: 'clip-muted'});
    expect(mockedSend).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
  });

  it('removes muted MIDI clips from native playback for looper comping', () => {
    const block: DAWBlock = {
      id: 'clip-midi-muted',
      trackId: 'track-keys',
      name: 'Muted MIDI',
      startBeat: 0,
      lengthBeats: 4,
      type: 'midi',
      color: '#4a7fd4',
      isMuted: true,
      notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
    };

    upsertBlockForEngine(block);

    expect(mockedSend).toHaveBeenCalledWith('delete_clip', {clipId: 'clip-midi-muted'});
    expect(mockedSend).not.toHaveBeenCalledWith('upsert_midi_clip', expect.anything());
  });

  it('removes missing audio clips from native playback instead of reloading stale media', () => {
    const block: DAWBlock = {
      id: 'clip-missing',
      trackId: 'track-audio',
      name: 'Offline Loop',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#4a7fd4',
      isMissingMedia: true,
      audioFilePath: 'imports/offline.wav',
      absoluteAudioFilePath: '/tmp/imports/offline.wav',
    };

    upsertBlockForEngine(block);

    expect(mockedSend).toHaveBeenCalledWith('delete_clip', {clipId: 'clip-missing'});
    expect(mockedSend).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
  });

  it('keeps compressed audio out of native clip binding until it is prepared', () => {
    const block: DAWBlock = {
      id: 'clip-compressed',
      trackId: 'track-audio',
      name: 'Compressed Loop',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#4a7fd4',
      audioFilePath: 'imports/loop.mp3',
      absoluteAudioFilePath: '/tmp/imports/loop.mp3',
    };

    upsertBlockForEngine(block);

    expect(mockedSend).toHaveBeenCalledWith('delete_clip', {clipId: 'clip-compressed'});
    expect(mockedSend).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
    expect(mockedSendAsync).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
  });

  it('removes clips on disabled tracks from native playback', () => {
    useDAWStore.setState({
      tracks: [{
        id: 'track-disabled',
        name: 'Disabled',
        isMuted: false,
        isSolo: false,
        type: 'voice_audio',
        instrumentId: 'voice_audio',
        presetId: 'voice_audio',
        isRecordArmed: false,
        isLocked: false,
        isDisabled: true,
      }],
    });
    const block: DAWBlock = {
      id: 'clip-disabled-track',
      trackId: 'track-disabled',
      name: 'Disabled Track Loop',
      startBeat: 0,
      lengthBeats: 4,
      type: 'audio',
      color: '#4a7fd4',
      audioFilePath: 'imports/disabled.wav',
      absoluteAudioFilePath: '/tmp/imports/disabled.wav',
    };

    upsertBlockForEngine(block);

    expect(mockedSend).toHaveBeenCalledWith('delete_clip', {clipId: 'clip-disabled-track'});
    expect(mockedSend).not.toHaveBeenCalledWith('upsert_audio_clip', expect.anything());
  });
});
