import {
  appendLiveAudioPeaks,
  buildGhostMidiBlock,
  emptyLiveMidiPreview,
  findMidiOverlayBlock,
  shouldShowGhostMidiPreview,
} from '../src/store/livePreview';
import {applyRecordingUpdatePayload} from '../src/store/recordingUpdateRoute';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import type {DAWBlock} from '../src/store/useDAWStore';
import {useDAWStore} from '../src/store/useDAWStore';

jest.mock('../src/native/refreshPlayback', () => ({
  refreshPlaybackAndInstruments: jest.fn(),
  upsertBlockForEngine: jest.fn(),
}));

function resetStore(): void {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
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
    playheadBeat: 4,
    playheadSeconds: 0,
    playheadOwnedByUser: true,
    playAwaitingEngine: false,
    playWallClockAnchor: null,
    playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
    midiAudition: null,
  });
}

const midiBlock = (overrides: Partial<DAWBlock> = {}): DAWBlock => ({
  id: 'clip-1',
  trackId: 'track-1',
  name: 'Clip',
  startBeat: 0,
  lengthBeats: 8,
  type: 'midi',
  color: '#4a7fd4',
  notes: [{note: 60, velocity: 100, startBeat: 0, lengthBeats: 1}],
  ...overrides,
});

describe('livePreview helpers', () => {
  it('findMidiOverlayBlock prefers recording block', () => {
    const blocks = [
      midiBlock({id: 'other'}),
      midiBlock({id: 'rec', name: 'Recording'}),
    ];
    expect(findMidiOverlayBlock(blocks, 'track-1', 'rec', null)?.id).toBe('rec');
  });

  it('appendLiveAudioPeaks downsamples when over cap instead of tail-slicing', () => {
    let peaks = Array.from({length: 5000}, () => 0.5);
    peaks = appendLiveAudioPeaks(peaks, [1]);
    expect(peaks.length).toBeLessThanOrEqual(4096);
    expect(peaks.length).toBeGreaterThan(0);
  });

  it('shouldShowGhostMidiPreview only while recording without an overlay clip', () => {
    const preview = {
      ...emptyLiveMidiPreview('track-1', null, 2),
      active: {64: {startBeat: 0, velocity: 100}},
    };
    expect(shouldShowGhostMidiPreview(preview, 'track-1', false)).toBe(false);
    expect(shouldShowGhostMidiPreview(preview, 'track-1', true)).toBe(true);
    const ghost = buildGhostMidiBlock(preview, 'track-1', '#fff', 4);
    expect(ghost.id).toMatch(/^ghost-midi-/);
    expect(ghost.notes?.length ?? 0).toBeGreaterThan(0);
  });
});

describe('live preview store actions', () => {
  beforeEach(() => {
    resetStore();
  });

  it('begin/end live MIDI note clears after note-off when not recording', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    useDAWStore.setState({
      blocks: [midiBlock({trackId, id: 'clip-a'})],
      selectedBlockId: 'clip-a',
    });

    const store = useDAWStore.getState();
    store.beginLiveMidiNote(trackId, 60, 100, 2);
    expect(useDAWStore.getState().liveMidiPreviewByTrack[trackId]!.active[60]).toBeDefined();

    store.endLiveMidiNote(trackId, 60, 3);
    expect(useDAWStore.getState().liveMidiPreviewByTrack[trackId]).toBeUndefined();
  });

  it('accumulates preview notes while MIDI recording', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    const recording = midiBlock({trackId, id: 'rec', name: 'Recording', notes: []});
    useDAWStore.setState({
      blocks: [recording],
      isRecording: true,
      recordingBlockId: 'rec',
    });

    const store = useDAWStore.getState();
    store.beginLiveMidiNote(trackId, 64, 110, 1);
    store.endLiveMidiNote(trackId, 64, 2);
    expect(useDAWStore.getState().liveMidiPreviewByTrack[trackId]?.notes).toHaveLength(1);
  });

  it('clearLiveMidiPreview and finalizeRecordingSession drop transient state', () => {
    useDAWStore.getState().addTrackFromTemplate('virtual_instrument');
    const trackId = useDAWStore.getState().tracks[0]!.id;
    const recording = midiBlock({trackId, id: 'rec', name: 'Recording', notes: []});
    useDAWStore.setState({
      blocks: [recording],
      isRecording: true,
      recordingBlockId: 'rec',
      liveMidiPreviewByTrack: {
        [trackId]: emptyLiveMidiPreview(trackId, 'rec', 0),
      },
    });

    useDAWStore.getState().finalizeRecordingSession([
      {note: 60, velocity: 100, startBeat: 0, lengthBeats: 1},
    ]);
    expect(useDAWStore.getState().liveMidiPreviewByTrack[trackId]).toBeUndefined();
    expect(useDAWStore.getState().blocks[0]?.notes).toHaveLength(1);
  });

  it('appendLiveAudioPeaks stores peaks by clip id', () => {
    useDAWStore.getState().appendLiveAudioPeaks('t1', 'clip-audio', [0.2, 0.5]);
    expect(useDAWStore.getState().liveAudioPreviewByClip['clip-audio']?.peaks).toEqual([0.2, 0.5]);
    useDAWStore.getState().appendLiveAudioPeaks('t1', 'clip-audio', [0.8]);
    expect(useDAWStore.getState().liveAudioPreviewByClip['clip-audio']?.peaks).toEqual([0.2, 0.5, 0.8]);
  });
});

describe('recordingUpdateRoute', () => {
  beforeEach(() => {
    resetStore();
  });

  it('routes audioInputPeaks into live audio preview', () => {
    const append = jest.fn();
    applyRecordingUpdatePayload(
      {
        event: 'audioInputPeaks',
        trackId: 't1',
        clipId: 'c1',
        peaks: [0.1, 0.3],
        isRecording: true,
      },
      {
        appendLiveAudioPeaks: append,
        setIsRecording: jest.fn(),
        clearLiveAudioPreview: jest.fn(),
        finalizeRecordingSession: jest.fn(),
        recordingBlockId: null,
      },
    );
    expect(append).toHaveBeenCalledWith('t1', 'c1', [0.1, 0.3]);
  });

  it('clears live audio preview when native signals audio stop', () => {
    const clear = jest.fn();
    applyRecordingUpdatePayload(
      {
        isRecording: false,
        clipId: 'c1',
        audioFilePath: '/tmp/take.wav',
      },
      {
        appendLiveAudioPeaks: jest.fn(),
        setIsRecording: jest.fn(),
        clearLiveAudioPreview: clear,
        finalizeRecordingSession: jest.fn(),
        recordingBlockId: null,
      },
    );
    expect(clear).toHaveBeenCalledWith('c1');
  });
});
