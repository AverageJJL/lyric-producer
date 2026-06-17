import {type DAWBlock, useDAWStore} from '../src/store/useDAWStore';

describe('track selection', () => {
  beforeEach(() => {
    useDAWStore.setState({
      isPlaying: false,
      bpm: 120,
      tracks: [],
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
      playheadOwnedByUser: true,
      playAwaitingEngine: false,
      playWallClockAnchor: null,
      playStartSeconds: 0,
      syncSource: 'ui',
    });
  });

  it('selectTrack sets selectedTrackId', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.getState().selectTrack(trackId!);
    expect(useDAWStore.getState().selectedTrackId).toBe(trackId);
    expect(useDAWStore.getState().selectedBlockIds).toEqual([]);
  });

  it('selectBlock syncs selectedTrackId from clip', () => {
    useDAWStore.getState().addDrumMachineTrack();
    const blockId = useDAWStore.getState().blocks[0]?.id;
    const trackId = useDAWStore.getState().tracks[0]?.id;

    useDAWStore.setState({selectedTrackId: null});
    useDAWStore.getState().selectBlock(blockId ?? null);
    expect(useDAWStore.getState().selectedTrackId).toBe(trackId);
    expect(useDAWStore.getState().selectedBlockIds).toEqual([blockId]);
  });

  it('toggles multiple selected clips with additive selection', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-a',
          trackId,
          name: 'A',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
        {
          id: 'clip-b',
          trackId,
          name: 'B',
          startBeat: 4,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
    });

    useDAWStore.getState().selectBlock('clip-a');
    useDAWStore.getState().selectBlock('clip-b', {additive: true});
    expect(useDAWStore.getState().selectedBlockIds).toEqual(['clip-a', 'clip-b']);
    expect(useDAWStore.getState().selectedBlockId).toBe('clip-b');

    useDAWStore.getState().selectBlock('clip-a', {additive: true});
    expect(useDAWStore.getState().selectedBlockIds).toEqual(['clip-b']);
    expect(useDAWStore.getState().selectedBlockId).toBe('clip-b');
  });

  it('deselecting block keeps selectedTrackId', () => {
    useDAWStore.getState().addDrumMachineTrack();
    const trackId = useDAWStore.getState().tracks[0]?.id;
    useDAWStore.getState().selectTrack(trackId!);

    const blockId = useDAWStore.getState().blocks[0]?.id;
    useDAWStore.getState().selectBlock(blockId ?? null);
    useDAWStore.getState().selectBlock(null);

    expect(useDAWStore.getState().selectedTrackId).toBe(trackId);
  });

  it('removing the last midi block keeps its software instrument track selected', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    const block: DAWBlock = {
      id: 'clip-midi-1',
      trackId: trackId!,
      name: 'Lead',
      startBeat: 0,
      lengthBeats: 4,
      type: 'midi',
      color: '#4a7fd4',
      notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
    };
    useDAWStore.setState({blocks: [block], selectedBlockId: block.id, selectedBlockIds: [block.id]});

    useDAWStore.getState().removeBlock(block.id);

    const state = useDAWStore.getState();
    expect(state.blocks).toHaveLength(0);
    expect(state.tracks).toHaveLength(1);
    expect(state.tracks[0]?.id).toBe(trackId);
    expect(state.selectedTrackId).toBe(trackId);
    expect(state.selectedBlockId).toBeNull();
    expect(state.selectedBlockIds).toEqual([]);
  });

  it('removeTrack still deletes the track and its clips', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]?.id;
    expect(trackId).toBeTruthy();

    useDAWStore.setState({
      blocks: [
        {
          id: 'clip-midi-1',
          trackId: trackId!,
          name: 'Lead',
          startBeat: 0,
          lengthBeats: 4,
          type: 'midi',
          color: '#4a7fd4',
          notes: [],
        },
      ],
      selectedTrackId: trackId,
    });

    useDAWStore.getState().removeTrack(trackId!);

    const state = useDAWStore.getState();
    expect(state.tracks).toHaveLength(0);
    expect(state.blocks).toHaveLength(0);
  });
});
