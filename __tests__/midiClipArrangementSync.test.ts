import {applyArrangementOperations} from '../src/arrangement/operations';
import {useDAWStore} from '../src/store/useDAWStore';

const mockUpsertBlockForEngine = jest.fn();
const mockRefreshPlaybackAndInstruments = jest.fn();

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: (...args: unknown[]) => mockRefreshPlaybackAndInstruments(...args),
  upsertBlockForEngine: (...args: unknown[]) => mockUpsertBlockForEngine(...args),
}));

describe('midi clip arrangement sync', () => {
  beforeEach(() => {
    mockUpsertBlockForEngine.mockClear();
    mockRefreshPlaybackAndInstruments.mockClear();
    useDAWStore.setState({
      isPlaying: false,
      bpm: 120,
      tracks: [],
      patterns: {},
      blocks: [],
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
      playheadOwnedByUser: false,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      syncSource: 'ui',
      timeSignature: {numerator: 4, denominator: 4},
      scale: null,
      chord: null,
      sections: [],
      midiAudition: null,
    });
  });

  it('normalizes off-grid notes before store and engine upsert', () => {
    applyArrangementOperations([
      {op: 'createTrack', templateId: 'virtual_instrument', instrumentId: 'synth_lead'},
      {
        op: 'upsertMidiClip',
        clip: {
          id: 'clip-gen',
          trackId: useDAWStore.getState().tracks[0]?.id ?? 'missing',
          name: 'Generated',
          startBeat: 0,
          lengthBeats: 2,
          notes: [{note: 60, velocity: 100, startBeat: 0.13, lengthBeats: 0.5}],
        },
      },
    ]);

    const block = useDAWStore.getState().blocks.find(item => item.id === 'clip-gen');
    expect(block?.notes?.[0]?.startBeat).toBe(0.25);
    expect(block?.lengthBeats).toBeGreaterThanOrEqual(4);
    expect(mockUpsertBlockForEngine).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'clip-gen',
        notes: block?.notes,
        lengthBeats: block?.lengthBeats,
      }),
    );
  });
});
