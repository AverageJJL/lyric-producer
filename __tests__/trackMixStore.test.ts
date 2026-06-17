import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {resetArrangementHistoryForTests} from '../src/store/history';
import {useDAWStore} from '../src/store/useDAWStore';
import {
  MAX_TRACK_GAIN_DB,
  MAX_TRACK_PAN,
  MAX_TRACK_VOLUME_DB,
} from '../src/music/trackMix';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  resetArrangementHistoryForTests();
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    tracks: [],
    patterns: {},
    blocks: [],
    masterVolumeDb: 0,
    masterPan: 0,
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
  });
}

describe('track mix store actions', () => {
  beforeEach(() => resetStore());

  it('updates and clamps per-track mixer state', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().setTrackVolumeDb(trackId!, 99);
    useDAWStore.getState().setTrackPan(trackId!, 2);
    useDAWStore.getState().setTrackGainDb(trackId!, 99);

    expect(useDAWStore.getState().tracks[0]).toMatchObject({
      volumeDb: MAX_TRACK_VOLUME_DB,
      pan: MAX_TRACK_PAN,
      gainDb: MAX_TRACK_GAIN_DB,
    });
  });

  it('records mixer changes in arrangement history', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().setTrackVolumeDb(trackId!, -12);
    expect(useDAWStore.getState().tracks[0]?.volumeDb).toBe(-12);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.volumeDb).toBe(0);
  });

  it('persists voice-track input monitoring policy with undo', () => {
    useDAWStore.getState().addTrackFromTemplate('voice_audio');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().setTrackInputMonitoring(trackId!, true);
    expect(useDAWStore.getState().tracks[0]?.isInputMonitoringEnabled).toBe(true);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.isInputMonitoringEnabled).toBe(false);
  });

  it('stores track automation mode and lane metadata with undo', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().setTrackAutomationMode(trackId!, 'touch');
    useDAWStore.getState().upsertTrackAutomationLane(trackId!, {
      targetType: 'fx',
      parameterId: 'eq.gain',
      points: [{beat: 8, value: 0.5}, {beat: 4, value: -3}],
    });

    expect(useDAWStore.getState().tracks[0]).toMatchObject({
      automationMode: 'touch',
      automationLanes: expect.arrayContaining([
        {targetType: 'track', parameterId: 'volumeDb', points: []},
        {targetType: 'track', parameterId: 'pan', points: []},
        {
          targetType: 'fx',
          parameterId: 'eq.gain',
          points: [{beat: 4, value: -3}, {beat: 8, value: 0.5}],
        },
      ]),
    });

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.automationMode).toBe('touch');
    expect(useDAWStore.getState().tracks[0]?.automationLanes)
      .toHaveLength(2);
  });

  it('writes and removes track automation points with undo', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().setTrackAutomationPoint(
      trackId!,
      'track',
      'volumeDb',
      8,
      99,
    );
    useDAWStore.getState().setTrackAutomationPoint(
      trackId!,
      'track',
      'volumeDb',
      8,
      -3,
    );
    useDAWStore.getState().setTrackAutomationPoint(trackId!, 'fx', 'eq.dryWet', 8, 1.25);
    useDAWStore.getState().setTrackAutomationPoint(
      trackId!,
      'instrument',
      'filter.cutoff',
      8,
      0.42,
    );

    const volumeLane = useDAWStore.getState().tracks[0]?.automationLanes
      ?.find(lane => lane.targetType === 'track' && lane.parameterId === 'volumeDb');
    const fxLane = useDAWStore.getState().tracks[0]?.automationLanes
      ?.find(lane => lane.targetType === 'fx' && lane.parameterId === 'eq.dryWet');
    const instrumentLane = useDAWStore.getState().tracks[0]?.automationLanes
      ?.find(lane => lane.targetType === 'instrument' && lane.parameterId === 'filter.cutoff');
    expect(volumeLane?.points).toEqual([{beat: 8, value: -3}]);
    expect(fxLane?.points).toEqual([{beat: 8, value: 1.25}]);
    expect(instrumentLane?.points).toEqual([{beat: 8, value: 0.42}]);

    useDAWStore.getState().removeTrackAutomationPoint(trackId!, 'track', 'volumeDb', 8);
    expect(useDAWStore.getState().tracks[0]?.automationLanes
      ?.find(lane => lane.parameterId === 'volumeDb')?.points).toEqual([]);

    useDAWStore.getState().undo();
    expect(useDAWStore.getState().tracks[0]?.automationLanes
      ?.find(lane => lane.parameterId === 'volumeDb')?.points).toEqual([{beat: 8, value: -3}]);
  });

  it('updates master mix and records it in arrangement history', () => {
    useDAWStore.getState().setMasterVolumeDb(-10);
    useDAWStore.getState().setMasterPan(0.5);

    expect(useDAWStore.getState()).toMatchObject({
      masterVolumeDb: -10,
      masterPan: 0.5,
    });

    useDAWStore.getState().undo();
    expect(useDAWStore.getState()).toMatchObject({
      masterVolumeDb: -10,
      masterPan: 0,
    });

    useDAWStore.getState().undo();
    expect(useDAWStore.getState()).toMatchObject({
      masterVolumeDb: 0,
      masterPan: 0,
    });
  });
});
