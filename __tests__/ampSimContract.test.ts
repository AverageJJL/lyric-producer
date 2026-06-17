import {
  emptyTrackAmpSimState,
  getTrackAmpSimState,
  normalizeTrackAmpSimForSet,
  setTrackAmpSimState,
  type TrackAmpSimState,
} from '../src/native/ampSimContract';
import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

describe('ampSimContract', () => {
  beforeEach(() => mockedSend.mockReset());

  it('builds a disabled DI amp-sim default with a native cabinet IR id', () => {
    expect(emptyTrackAmpSimState('track-gtr')).toMatchObject({
      trackId: 'track-gtr',
      enabled: false,
      inputMode: 'guitar_di',
      cabinet: {enabled: true, irId: 'guitar_us_2x12', mix: 1},
    });
  });

  it('normalizes AI pedalboard payloads before set_amp_sim', () => {
    const state: TrackAmpSimState = {
      ...emptyTrackAmpSimState('track-bass', 'bass_di'),
      enabled: true,
      pedals: Array.from({length: 10}, (_, index) => ({
        id: index === 0 ? '' : `p-${index}`,
        type: index === 0 ? 'unknown' as never : 'overdrive',
        enabled: true,
        params: {drive: 1.7, tone: -0.2, note: Number.NaN},
      })),
      cabinet: {enabled: true, irId: 'not-real' as never, mix: 1.5},
    };

    const normalized = normalizeTrackAmpSimForSet(state);
    expect(normalized.pedals).toHaveLength(8);
    expect(normalized.pedals[0]).toMatchObject({
      id: 'pedal-1',
      type: 'boost',
      params: {drive: 1, tone: 0},
    });
    expect(normalized.cabinet).toEqual({
      enabled: true,
      irId: 'bass_modern_8x10',
      mix: 1,
    });
  });

  it('sends set_amp_sim and returns the native-confirmed state', () => {
    mockedSend.mockImplementation((command, payload) =>
      JSON.stringify({
        ok: true,
        command,
        data: {...payload, monitoring: true, lowLatencyMonitoring: true},
      }),
    );

    const result = setTrackAmpSimState({
      ...emptyTrackAmpSimState('track-gtr'),
      enabled: true,
    });

    expect(mockedSend).toHaveBeenCalledWith('set_amp_sim', expect.objectContaining({
      trackId: 'track-gtr',
      enabled: true,
    }));
    expect(result).toMatchObject({
      ok: true,
      state: {trackId: 'track-gtr', monitoring: true},
    });
  });

  it('loads get_amp_sim responses and falls back when native is unavailable', () => {
    mockedSend.mockReturnValueOnce(JSON.stringify({
      ok: true,
      data: {
        ...emptyTrackAmpSimState('track-bass', 'bass_di'),
        enabled: true,
        monitoring: true,
      },
    }));

    expect(getTrackAmpSimState('track-bass')).toMatchObject({
      enabled: true,
      inputMode: 'bass_di',
      monitoring: true,
    });

    mockedSend.mockReturnValueOnce(null);
    expect(getTrackAmpSimState('missing')).toMatchObject({
      trackId: 'missing',
      enabled: false,
    });
  });

  it('returns the previous state when native rejects the payload', () => {
    const previous = {...emptyTrackAmpSimState('track-gtr'), enabled: true};
    mockedSend.mockReturnValue(JSON.stringify({
      ok: false,
      error: {message: 'Amp sim requires an audio/DI track.'},
    }));

    const result = setTrackAmpSimState(previous);
    expect(result).toEqual({
      ok: false,
      error: 'Amp sim requires an audio/DI track.',
      previousState: previous,
    });
  });
});
