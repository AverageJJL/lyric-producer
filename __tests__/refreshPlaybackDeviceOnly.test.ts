import {
  refreshPlaybackAndInstruments,
  refreshPlaybackDeviceOnly,
} from '../src/native/refreshPlayback';
import {
  sendNativeAudioCommand,
  sendNativeAudioCommandAsync,
} from '../src/native/NativeAudioEngine';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => JSON.stringify({ok: true, data: {}})),
  sendNativeAudioCommandAsync: jest.fn(() => Promise.resolve(JSON.stringify({ok: true, data: {}}))),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;
const mockedSendAsync = sendNativeAudioCommandAsync as jest.MockedFunction<
  typeof sendNativeAudioCommandAsync
>;

function resetStoreWithAudioClip(): void {
  useDAWStore.setState({
    tracks: [{
      id: 'track-audio',
      name: 'Audio',
      isMuted: false,
      isSolo: false,
      type: 'voice_audio',
      instrumentId: 'voice_audio',
      presetId: 'voice_audio',
      isRecordArmed: false,
      isLocked: false,
    }],
    blocks: [{
      id: 'clip-audio',
      trackId: 'track-audio',
      name: 'Frozen Hearts',
      startBeat: 0,
      lengthBeats: 248,
      type: 'audio',
      color: '#5a8cff',
      audioFilePath: 'imports/Frozen Hearts_bass-3.mp3',
      absoluteAudioFilePath:
        '/Users/jlang/Library/Application Support/MusicApp/assets/imports/Frozen Hearts_bass-3.mp3',
      sourceLengthBeats: 248,
      sourceOffsetBeats: 0,
    }],
    bpm: 120,
    masterVolumeDb: 0,
    masterPan: 0,
  });
}

describe('device-only playback refresh', () => {
  beforeEach(() => {
    resetStoreWithAudioClip();
    mockedSend.mockImplementation(() => JSON.stringify({ok: true, data: {}}));
    mockedSend.mockClear();
    mockedSendAsync.mockClear();
  });

  afterEach(() => {
    mockedSend.mockReset();
    mockedSendAsync.mockReset();
  });

  it('does not upsert saved project audio clips during startup device heal', () => {
    refreshPlaybackDeviceOnly({useSystemDefault: true, forceReopen: false});

    expect(mockedSend).toHaveBeenCalledWith(
      'refresh_audio_device',
      expect.objectContaining({
        useSystemDefault: true,
        forceReopen: false,
        restoreStereoPlayback: false,
      }),
    );
    expect(mockedSend.mock.calls.map(([command]) => command)).not.toContain(
      'upsert_audio_clip',
    );
    expect(mockedSend.mock.calls.map(([command]) => command)).not.toContain('setTracks');
  });

  it('keeps full playback refresh available for explicit arrangement rebinds', () => {
    useDAWStore.setState({
      blocks: useDAWStore.getState().blocks.map(block => ({
        ...block,
        audioFilePath: 'imports/Frozen Hearts_bass-3.wav',
        absoluteAudioFilePath:
          '/Users/jlang/Library/Application Support/MusicApp/assets/imports/Frozen Hearts_bass-3.wav',
      })),
    });

    refreshPlaybackAndInstruments();

    expect(mockedSend.mock.calls.map(([command]) => command)).not.toContain('upsert_audio_clip');
    expect(mockedSendAsync.mock.calls.map(([command]) => command)).toContain('upsert_audio_clip');
  });
});
