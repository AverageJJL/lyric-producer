import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {captureNativeTrackAutomationPoint} from '../src/native/trackAutomationCapture';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

describe('native automation capture', () => {
  beforeEach(() => mockedSend.mockReset());

  it('parses captured native automation point responses', () => {
    mockedSend.mockReturnValue(JSON.stringify({
      ok: true,
      data: {
        trackId: 'track-1',
        targetType: 'track',
        parameterId: 'volumeDb',
        beat: 6,
        value: -6,
        automationMode: 'touch',
        lane: {
          targetType: 'track',
          parameterId: 'volumeDb',
          pointCount: 3,
          points: [
            {beat: 0, value: -9},
            {beat: 6, value: -6},
            {beat: 8, value: -3},
          ],
        },
      },
    }));

    const capture = captureNativeTrackAutomationPoint({
      trackId: 'track-1',
      targetType: 'track',
      parameterId: 'volumeDb',
      beat: 6,
    });

    expect(mockedSend).toHaveBeenCalledWith('capture_track_automation', {
      trackId: 'track-1',
      targetType: 'track',
      parameterId: 'volumeDb',
      beat: 6,
    });
    expect(capture).toEqual(expect.objectContaining({
      trackId: 'track-1',
      targetType: 'track',
      parameterId: 'volumeDb',
      beat: 6,
      value: -6,
    }));
    expect(capture?.lane.pointCount).toBe(3);
  });

  it('returns null for unavailable or malformed responses', () => {
    mockedSend.mockReturnValueOnce(null);
    expect(captureNativeTrackAutomationPoint({
      trackId: 'track-1',
      targetType: 'track',
      parameterId: 'volumeDb',
    })).toBeNull();

    mockedSend.mockReturnValueOnce(JSON.stringify({ok: true, data: {trackId: 'track-1'}}));
    expect(captureNativeTrackAutomationPoint({
      trackId: 'track-1',
      targetType: 'track',
      parameterId: 'volumeDb',
    })).toBeNull();
  });
});
