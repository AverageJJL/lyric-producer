jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

import {act, renderHook} from '@testing-library/react';

import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';
import {useTrackAutomationCapture} from '../src/hooks/useTrackAutomationCapture';

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

const track: DAWTrack = {
  id: 'track-keys',
  name: 'Keys',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: false,
  isRecordArmed: false,
  isLocked: false,
  automationMode: 'touch',
  automationLanes: [{targetType: 'track', parameterId: 'pan', points: []}],
};

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    tracks: [track],
    patterns: {},
    blocks: [],
    bpm: 120,
    tempoMap: [],
    meterMap: [],
    masterVolumeDb: 0,
    masterPan: 0,
    performanceMode: 'linear',
    looperLengthBars: 4,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null,
    chord: null,
    sections: [],
    syncSource: 'ui',
  });
}

describe('useTrackAutomationCapture', () => {
  beforeEach(() => {
    mockedSend.mockReset();
    resetStore();
  });

  it('mirrors captured native automation lanes into the project store', () => {
    mockedSend.mockReturnValue(JSON.stringify({
      ok: true,
      data: {
        trackId: 'track-keys',
        targetType: 'track',
        parameterId: 'volumeDb',
        beat: 6,
        value: -9,
        automationMode: 'touch',
        lane: {
          targetType: 'track',
          parameterId: 'volumeDb',
          pointCount: 1,
          points: [{beat: 6, value: -9}],
        },
      },
    }));

    const {result} = renderHook(() => useTrackAutomationCapture());
    act(() => result.current('track-keys', 'track', 'volumeDb', 6));

    expect(mockedSend).toHaveBeenCalledWith('capture_track_automation', {
      trackId: 'track-keys',
      targetType: 'track',
      parameterId: 'volumeDb',
      beat: 6,
    });
    expect(useDAWStore.getState().tracks[0]?.automationLanes).toEqual([
      {targetType: 'track', parameterId: 'pan', points: []},
      {targetType: 'track', parameterId: 'volumeDb', points: [{beat: 6, value: -9}]},
    ]);
  });

  it('leaves the store unchanged when native capture is unavailable', () => {
    mockedSend.mockReturnValue(null);

    const {result} = renderHook(() => useTrackAutomationCapture());
    act(() => result.current('track-keys', 'track', 'volumeDb', 6));

    expect(useDAWStore.getState().tracks[0]?.automationLanes).toEqual(track.automationLanes);
  });
});
