import {sendNativeAudioCommand} from '../src/native/NativeAudioEngine';
import {syncMasterMixToEngine, syncTracksToEngine} from '../src/native/refreshPlayback';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore, type DAWTrack} from '../src/store/useDAWStore';

jest.mock('../src/native/NativeAudioEngine', () => ({
  sendNativeAudioCommand: jest.fn(() => '{"ok":true}'),
}));

const mockedSend = sendNativeAudioCommand as jest.MockedFunction<typeof sendNativeAudioCommand>;

const track: DAWTrack = {
  id: 'track-1',
  name: 'Lead',
  type: 'software_instrument',
  instrumentId: 'synth_lead',
  presetId: 'pop_lead',
  isMuted: false,
  isSolo: true,
  isRecordArmed: false,
  isInputMonitoringEnabled: true,
  isLocked: false,
  trackFolderName: 'Song A',
  trackGroupName: 'Keys',
  automationMode: 'latch',
  automationLanes: [
    {targetType: 'track', parameterId: 'volumeDb', points: [{beat: 4, value: -3}]},
    {targetType: 'fx', parameterId: 'eq.dryWet', points: [{beat: 4, value: 1}]},
    {targetType: 'instrument', parameterId: 'filter.cutoff', points: [{beat: 4, value: 0.42}]},
  ],
  volumeDb: -9,
  pan: -0.25,
  gainDb: 3,
};

describe('track payload sync', () => {
  beforeEach(() => mockedSend.mockClear());

  it('sends mixer state through the setTracks bridge payload', () => {
    syncTracksToEngine([track]);

    expect(mockedSend).toHaveBeenCalledWith(
      'setTracks',
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            id: 'track-1',
            volumeDb: -9,
            pan: -0.25,
            gainDb: 3,
            effectiveVolumeDb: -6,
            isInputMonitoringEnabled: false,
            isFrozen: false,
            trackFolderName: 'Song A',
            trackGroupName: 'Keys',
            automationMode: 'latch',
            automationLanes: [
              {targetType: 'track', parameterId: 'volumeDb', points: [{beat: 4, value: -3}]},
              {targetType: 'fx', parameterId: 'eq.dryWet', points: [{beat: 4, value: 1}]},
              {
                targetType: 'instrument',
                parameterId: 'filter.cutoff',
                points: [{beat: 4, value: 0.42}],
              },
            ],
            routingRole: 'track',
            routingOutputTrackId: 'master',
            routingSends: [],
            routingSidechainSourceTrackId: '',
          }),
        ],
      }),
    );
  });

  it('sends normalized routing metadata through the native bridge payload', () => {
    const bus = {
      ...track,
      id: 'bus-1',
      name: 'Bus',
      isSolo: false,
      routingRole: 'bus' as const,
      automationLanes: [],
    };

    syncTracksToEngine([
      {
        ...track,
        routingOutputTrackId: 'bus-1',
        routingSends: [{targetTrackId: 'bus-1', gainDb: 99}],
        routingSidechainSourceTrackId: 'bus-1',
      },
      bus,
    ]);

    expect(mockedSend).toHaveBeenCalledWith(
      'setTracks',
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            id: 'track-1',
            routingRole: 'track',
            routingOutputTrackId: 'bus-1',
            routingSends: [{targetTrackId: 'bus-1', gainDb: 6}],
            routingSidechainSourceTrackId: 'bus-1',
          }),
          expect.objectContaining({
            id: 'bus-1',
            routingRole: 'bus',
            routingOutputTrackId: 'master',
            routingSends: [],
            routingSidechainSourceTrackId: '',
          }),
        ],
      }),
    );
  });

  it('sends freeze metadata through the native bridge payload', () => {
    syncTracksToEngine([{...track, isFrozen: true}]);

    expect(mockedSend).toHaveBeenCalledWith(
      'setTracks',
      expect.objectContaining({
        tracks: [expect.objectContaining({id: 'track-1', isFrozen: true})],
      }),
    );
  });

  it('normalizes folder and group labels in the native bridge payload', () => {
    syncTracksToEngine([{
      ...track,
      trackFolderName: '  Verse   Stack  ',
      trackGroupName: '  Keys   Layer  ',
    }]);

    expect(mockedSend).toHaveBeenCalledWith(
      'setTracks',
      expect.objectContaining({
        tracks: [
          expect.objectContaining({
            id: 'track-1',
            trackFolderName: 'Verse Stack',
            trackGroupName: 'Keys Layer',
          }),
        ],
      }),
    );
  });

  it('omits disabled tracks from the native track payload', () => {
    syncTracksToEngine([
      track,
      {
        ...track,
        id: 'track-disabled',
        name: 'Disabled',
        isDisabled: true,
      },
    ]);

    expect(mockedSend).toHaveBeenCalledWith(
      'setTracks',
      expect.objectContaining({
        tracks: [expect.objectContaining({id: 'track-1'})],
      }),
    );
  });

  it('sends master bus state through the native bridge payload', () => {
    useDAWStore.setState({
      isPlaying: false,
      bpm: 120,
      isMetronomeEnabled: true,
      tracks: [],
      patterns: {},
      blocks: [],
      masterVolumeDb: -11,
      masterPan: 0.4,
      selectedBlockId: null,
      selectedBlockIds: [],
      selectedTrackId: null,
      isRecording: false,
      recordingBlockId: null,
      recordingStartSeconds: null,
      recordingWallClockStart: null,
      recordingError: null,
      playheadBeat: 0,
      playheadSeconds: 0,
      playheadOwnedByUser: true,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      playStartSeconds: 0,
      syncSource: 'ui',
      timeSignature: {...DEFAULT_TIME_SIGNATURE},
      scale: null,
      chord: null,
      sections: [],
      midiAudition: null,
      liveMidiPreviewByTrack: {},
      liveAudioPreviewByClip: {},
    });

    syncMasterMixToEngine();

    expect(mockedSend).toHaveBeenCalledWith('set_master_mix', {
      volumeDb: -11,
      pan: 0.4,
    });
  });
});
