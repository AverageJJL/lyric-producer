import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {setNativeInstrumentParameter} from '../src/native/instrumentParamContract';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

describe('instrument parameter contract', () => {
  beforeEach(() => mockedSend.mockReset());

  it('parses successful native FourOsc parameter responses', () => {
    mockedSend.mockReturnValue(JSON.stringify({
      ok: true,
      data: {
        trackId: 'track-1',
        targetType: 'instrument',
        parameterId: 'filter.cutoff',
        value: 0.42,
      },
    }));

    const result = setNativeInstrumentParameter({
      trackId: 'track-1',
      parameterId: 'filter.cutoff',
      value: 0.42,
    });

    expect(mockedSend).toHaveBeenCalledWith('set_track_instrument_param', {
      trackId: 'track-1',
      parameterId: 'filter.cutoff',
      value: 0.42,
    });
    expect(result).toEqual({
      trackId: 'track-1',
      targetType: 'instrument',
      parameterId: 'filter.cutoff',
      value: 0.42,
    });
  });

  it('returns null for unavailable or malformed native responses', () => {
    mockedSend.mockReturnValueOnce(null);
    expect(setNativeInstrumentParameter({
      trackId: 'track-1',
      parameterId: 'filter.cutoff',
      value: 0.5,
    })).toBeNull();

    mockedSend.mockReturnValueOnce(JSON.stringify({ok: true, data: {trackId: 'track-1'}}));
    expect(setNativeInstrumentParameter({
      trackId: 'track-1',
      parameterId: 'filter.resonance',
      value: 0.2,
    })).toBeNull();
  });
});
