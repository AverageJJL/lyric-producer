import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {getNativeTrackMixSnapshot} from '../src/native/trackMixIntrospection';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

describe('track mix introspection', () => {
  beforeEach(() => mockedSend.mockReset());

  it('parses the native channel strip snapshot', () => {
    mockedSend.mockReturnValue(JSON.stringify({
      ok: true,
      data: {
        channelStripVersion: 6,
        gainStageMode: 'separate_gain_trim',
        automationEvaluationBeat: 6,
        tracks: [{
          id: 'track-1',
          name: 'Lead',
          type: 'software_instrument',
          isMuted: false,
          isSolo: true,
          isInputMonitoringEnabled: false,
          isFrozen: true,
          trackFolderName: 'Verse',
          trackGroupName: 'Keys',
          automationMode: 'touch',
          automationReadActive: true,
          automationLaneCount: 3,
          automationEvaluationBeat: 6,
          automationLanes: [
            {
              targetType: 'track',
              parameterId: 'volumeDb',
              pointCount: 2,
              evaluatedValue: -7.5,
            },
          ],
          automationAppliedFaderDb: -7.5,
          automationAppliedPan: -0.25,
          nativeAutomationCurveCount: 2,
          nativeAutomationCurves: [
            {
              parameterId: 'volumeDb',
              pointCount: 2,
              bypassed: false,
              firstBeat: 0,
              firstValue: -9,
              lastBeat: 8,
              lastValue: -3,
            },
            {
              parameterId: 'pan',
              pointCount: 2,
              bypassed: false,
              firstBeat: 0,
              firstValue: -0.25,
              lastBeat: 8,
              lastValue: -0.25,
            },
          ],
          volumeDb: -9,
          pan: -0.25,
          gainDb: 3,
          effectiveVolumeDb: -6,
          nativeGainTrimDb: 3,
          nativeFaderDb: -7.5,
          nativeEffectiveVolumeDb: -4.5,
          routingRole: 'bus',
          routingOutputTrackId: 'bus-1',
          nativeRoutingOutputTrackId: 'bus-1',
          routingSendCount: 1,
          routingSends: [{targetTrackId: 'bus-1', gainDb: -9, preFader: true}],
          nativeAuxSendCount: 1,
          nativeAuxSends: [{
            busNumber: 0,
            targetTrackId: 'aux-1',
            gainDb: -12,
            muted: false,
            preFader: true,
          }],
          nativeAuxReturnBusNumber: -1,
          routingSidechainSourceTrackId: 'drums',
          nativeSidechainPluginCount: 1,
          nativeSidechainPlugins: [{
            pluginName: 'Compressor',
            pluginType: 'compressor',
            sourceTrackId: 'drums',
            wireCount: 3,
            canSidechain: true,
          }],
          gainStageMode: 'separate_gain_trim',
          channelStrip: {
            inputGainDb: 3,
            faderVolumeDb: -7.5,
            pan: -0.25,
            postFaderEffectiveDb: -4.5,
          },
        }],
        master: {volumeDb: -11, pan: 0.4},
      },
    }));

    const snapshot = getNativeTrackMixSnapshot('track-1');

    expect(mockedSend).toHaveBeenCalledWith('get_track_mix', {trackId: 'track-1'});
    expect(snapshot?.tracks[0]).toEqual(expect.objectContaining({
      id: 'track-1',
      gainDb: 3,
      nativeGainTrimDb: 3,
      nativeFaderDb: -7.5,
      nativeEffectiveVolumeDb: -4.5,
      isInputMonitoringEnabled: false,
      isFrozen: true,
      trackFolderName: 'Verse',
      trackGroupName: 'Keys',
      automationMode: 'touch',
      automationReadActive: true,
      automationLaneCount: 3,
      automationEvaluationBeat: 6,
      automationLanes: [
        {
          targetType: 'track',
          parameterId: 'volumeDb',
          pointCount: 2,
          evaluatedValue: -7.5,
        },
      ],
      automationAppliedFaderDb: -7.5,
      automationAppliedPan: -0.25,
      nativeAutomationCurveCount: 2,
      nativeAutomationCurves: [
        {
          parameterId: 'volumeDb',
          pointCount: 2,
          bypassed: false,
          firstBeat: 0,
          firstValue: -9,
          lastBeat: 8,
          lastValue: -3,
        },
        {
          parameterId: 'pan',
          pointCount: 2,
          bypassed: false,
          firstBeat: 0,
          firstValue: -0.25,
          lastBeat: 8,
          lastValue: -0.25,
        },
      ],
      routingRole: 'bus',
      routingOutputTrackId: 'bus-1',
      nativeRoutingOutputTrackId: 'bus-1',
      routingSendCount: 1,
      routingSends: [{targetTrackId: 'bus-1', gainDb: -9, preFader: true}],
      nativeAuxSendCount: 1,
      nativeAuxSends: [{
        busNumber: 0,
        targetTrackId: 'aux-1',
        gainDb: -12,
        muted: false,
        preFader: true,
      }],
      nativeAuxReturnBusNumber: -1,
      routingSidechainSourceTrackId: 'drums',
      nativeSidechainPluginCount: 1,
      nativeSidechainPlugins: [{
        pluginName: 'Compressor',
        pluginType: 'compressor',
        sourceTrackId: 'drums',
        wireCount: 3,
        canSidechain: true,
      }],
    }));
    expect(snapshot?.tracks[0]?.channelStrip).toMatchObject({
      inputGainDb: 3,
      faderVolumeDb: -7.5,
    });
    expect(snapshot?.master.volumeDb).toBe(-11);
  });

  it('returns null for unavailable or malformed native responses', () => {
    mockedSend.mockReturnValueOnce(null);
    expect(getNativeTrackMixSnapshot()).toBeNull();

    mockedSend.mockReturnValueOnce(JSON.stringify({ok: true, data: {tracks: []}}));
    expect(getNativeTrackMixSnapshot()).toBeNull();
  });
});
