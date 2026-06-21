import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {App} from '../src/web/App';

const sendCommand = jest.fn();
const fetchMock = jest.fn();

function resetStore() {
  useDAWStore.setState({
    isPlaying: false,
    bpm: 120,
    isMetronomeEnabled: true,
    recordingCountInBeats: 0,
    recordingPreRollBeats: 0,
    isPunchRecordingEnabled: false,
    isLoopRecordingEnabled: false,
    recordingLatencyCompensationMs: 0,
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
    liveMidiPreviewByTrack: {},
    liveAudioPreviewByClip: {},
  });
}

function installAudioEngineMock() {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  window.audioEngine = {sendCommand, onEvent: () => () => undefined};
}

function addGrandPianoTrack() {
  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: /Virtual Instrument/}));
  fireEvent.click(screen.getByRole('button', {name: 'Grand Piano'}));
}

beforeEach(() => {
  resetStore();
  installAudioEngineMock();
  fetchMock.mockResolvedValue({ok: true});
  (globalThis as unknown as {fetch: typeof fetchMock}).fetch = fetchMock;
  window.PointerEvent =
    window.PointerEvent ??
    (class MockPointerEvent extends MouseEvent {
      pointerId: number;
      constructor(type: string, props: PointerEventInit = {}) {
        super(type, props);
        this.pointerId = props.pointerId ?? 0;
      }
    } as typeof PointerEvent);
});

afterEach(() => {
  cleanup();
  sendCommand.mockReset();
  fetchMock.mockReset();
});

test('clicking a track row reopens the editor after closing it', () => {
  const {container} = render(<App />);

  addGrandPianoTrack();
  fireEvent.click(screen.getByRole('button', {name: /Close Piano Roll/}));
  expect(screen.queryByRole('heading', {name: 'Piano Roll'})).not.toBeInTheDocument();

  const trackHeader = container.querySelector('.track-row-header') as HTMLElement;
  fireEvent.click(trackHeader);

  expect(screen.getByRole('heading', {name: 'Piano Roll'})).toBeInTheDocument();
});

test('clicking a MIDI block reopens the editor after closing it', async () => {
  const {container} = render(<App />);

  addGrandPianoTrack();
  const trackId = useDAWStore.getState().tracks[0]!.id;
  act(() => {
    useDAWStore.setState({
      blocks: [{
        id: 'clip-1',
        trackId,
        name: 'Hook',
        startBeat: 0,
        lengthBeats: 4,
        type: 'midi',
        color: '#4a7fd4',
        notes: [{note: 60, velocity: 90, startBeat: 0, lengthBeats: 1}],
      }],
      selectedBlockId: 'clip-1',
      selectedBlockIds: ['clip-1'],
      selectedTrackId: trackId,
    });
  });

  fireEvent.click(screen.getByRole('button', {name: /Close Piano Roll/}));
  expect(screen.queryByRole('heading', {name: 'Piano Roll'})).not.toBeInTheDocument();

  const block = container.querySelector('.timeline-block') as HTMLDivElement;
  const blockSurface = block.querySelector('.timeline-block-clip-surface') as HTMLDivElement;
  block.setPointerCapture = jest.fn();
  fireEvent.pointerDown(blockSurface, {pointerId: 1, clientX: 24, clientY: 120, pageX: 24, pageY: 120});

  await waitFor(() => {
    expect(screen.getByRole('heading', {name: 'Piano Roll'})).toBeInTheDocument();
  });
});
