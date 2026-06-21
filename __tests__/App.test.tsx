import React from 'react';
import {act, cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';

// <App /> mounts the Copilot panel, which imports ESM markdown/highlighter deps
// that Jest does not transform in this repo's current test setup.
jest.mock('react-markdown', () => ({children}: {children: React.ReactNode}) => <>{children}</>);
jest.mock('remark-gfm', () => () => null);
jest.mock('react-syntax-highlighter', () => ({
  Prism: ({children}: {children: React.ReactNode}) => <pre>{children}</pre>,
}));
jest.mock('react-syntax-highlighter/dist/esm/styles/prism', () => ({vscDarkPlus: {}}));

import {DRUM_LANE_ICONS} from '../src/assets/drumKit';
import {DEFAULT_TIME_SIGNATURE} from '../src/store/projectMetadata';
import {useDAWStore} from '../src/store/useDAWStore';
import {PIXELS_PER_BEAT} from '../src/ui/timelineLayout';
import {App} from '../src/web/App';
import {MAX_EDITOR_PANEL_HEIGHT} from '../src/web/components/ResizableEditorPanel';

const sendCommand = jest.fn();
const sendCommandAsync = jest.fn();
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
    isRelativeSnapEnabled: false,
    isCycleEnabled: false,
    cycleStartBeat: 0,
    cycleEndBeat: 4,
    selectedBlockId: null,
    selectedBlockIds: [],
    selectedTrackId: null,
    isRecording: false,
    recordingBlockId: null, recordingStartSeconds: null, recordingWallClockStart: null, recordingError: null,
    playheadBeat: 0, playheadSeconds: 0, playheadOwnedByUser: true,
    playAwaitingEngine: false, playWallClockAnchor: null, playStartSeconds: 0,
    syncSource: 'ui',
    timeSignature: {...DEFAULT_TIME_SIGNATURE},
    scale: null, chord: null,
    sections: [],
    midiAudition: null,
    liveMidiPreviewByTrack: {}, liveAudioPreviewByClip: {},
  });
}
function installAudioEngineMock() {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({ok: true, data: {deviceName: 'Mock Output', sampleRate: 48000}});
    }
    return JSON.stringify({ok: true, data: {}});
  });
  sendCommandAsync.mockImplementation((command: string, payloadJson: string) =>
    Promise.resolve(sendCommand(command, payloadJson)),
  );
  window.audioEngine = {sendCommand, sendCommandAsync, onEvent: () => () => undefined};
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
      constructor(type: string, props: PointerEventInit = {}) { super(type, props); this.pointerId = props.pointerId ?? 0; }
    } as typeof PointerEvent);
  window.requestAnimationFrame = window.requestAnimationFrame ?? ((callback: FrameRequestCallback) => window.setTimeout(callback, 16));
  window.cancelAnimationFrame = window.cancelAnimationFrame ?? ((id: number) => window.clearTimeout(id));
});

afterEach(() => {
  jest.useRealTimers();
  cleanup();
  sendCommand.mockReset();
  sendCommandAsync.mockReset();
  fetchMock.mockReset();
});

test('renders the Electron DAW shell', () => {
  render(<App />);

  expect(screen.getByRole('button', {name: 'Play'})).toBeTruthy();
  expect(screen.getByRole('button', {name: 'Metronome'})).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('+ Add track')).toBeTruthy();
});

test('toggles the native click track from the transport', () => {
  render(<App />);
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Metronome'}));

  expect(screen.getByRole('button', {name: 'Metronome'})).toHaveAttribute('aria-pressed', 'false');
  expect(sendCommand).toHaveBeenCalledWith('set_click_track', JSON.stringify({enabled: false}));
});

test('play syncs BPM and click state before starting transport', () => {
  render(<App />);
  sendCommand.mockClear();

  fireEvent.click(screen.getByRole('button', {name: 'Play'}));

  const commandNames = sendCommand.mock.calls.map(([command]) => command);
  const asyncCommandNames = sendCommandAsync.mock.calls.map(([command]) => command);
  const bpmIndex = commandNames.indexOf('set_bpm');
  const clickIndex = commandNames.indexOf('set_click_track');
  const playIndex = asyncCommandNames.indexOf('transport_play');

  expect(bpmIndex).toBeGreaterThanOrEqual(0);
  expect(clickIndex).toBeGreaterThanOrEqual(0);
  expect(playIndex).toBeGreaterThanOrEqual(0);
  expect(sendCommand).toHaveBeenCalledWith('set_bpm', JSON.stringify({bpm: 120}));
  expect(sendCommand).toHaveBeenCalledWith('set_click_track', JSON.stringify({enabled: true}));
});

test('transport position follows the playhead', () => {
  render(<App />);

  expect(screen.getByLabelText('Transport position')).toHaveTextContent('001Bar1Beat');

  act(() => {
    useDAWStore.getState().setPlayheadBeat(4, {syncTransport: false});
  });
  expect(screen.getByLabelText('Transport position')).toHaveTextContent('002Bar1Beat');

  act(() => {
    useDAWStore.getState().setPlayheadBeat(7, {syncTransport: false});
  });
  expect(screen.getByLabelText('Transport position')).toHaveTextContent('002Bar4Beat');
});

test('shows Electron add-track options and opens the drum machine panel', () => {
  render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));

  expect(screen.getByRole('button', {name: /Virtual Instrument/})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Drum Machine'})).toBeInTheDocument();
  expect(screen.getByRole('button', {name: 'Voice / Audio'})).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', {name: 'Drum Machine'}));

  expect(screen.getByRole('heading', {name: 'Drum Machine'})).toBeInTheDocument();
  const drumEditor = screen.getAllByLabelText(/Drums ·/).find(element => element.tagName === 'SECTION');
  expect(drumEditor).toHaveStyle({height: '380px'});
});

test('virtual instrument opens the piano roll and auditions from the folded keyboard', () => {
  render(<App />);

  addGrandPianoTrack();

  expect(screen.getByRole('heading', {name: 'Piano Roll'})).toBeInTheDocument();
  expect(screen.queryByRole('heading', {name: 'Keyboard'})).not.toBeInTheDocument();
  expect(screen.getByLabelText('Piano Roll · Grand Piano')).toHaveStyle({height: `${MAX_EDITOR_PANEL_HEIGHT}px`});

  const c3 = screen.getByRole('button', {name: 'C3'});
  fireEvent.pointerDown(c3);
  fireEvent.pointerUp(c3);

  expect(sendCommand).toHaveBeenCalledWith('midi_note_on', expect.stringContaining('"note":48'));
  expect(sendCommand).toHaveBeenCalledWith('midi_note_off', expect.stringContaining('"note":48'));
});

test('E toggles the bottom piano roll for a software instrument', () => {
  render(<App />);

  addGrandPianoTrack();
  expect(screen.getByRole('heading', {name: 'Piano Roll'})).toBeInTheDocument();

  fireEvent.keyDown(window, {key: 'e'});
  expect(screen.queryByRole('heading', {name: 'Piano Roll'})).not.toBeInTheDocument();

  fireEvent.keyDown(window, {key: 'e'});
  expect(screen.getByRole('heading', {name: 'Piano Roll'})).toBeInTheDocument();
});

test('R starts MIDI recording and Space stops it', async () => {
  render(<App />);

  addGrandPianoTrack();
  sendCommand.mockClear();

  fireEvent.keyDown(window, {key: 'r'});

  await waitFor(() => expect(useDAWStore.getState().isRecording).toBe(true));
  expect(sendCommand).toHaveBeenCalledWith('start_recording', expect.stringContaining('"trackId"'));

  fireEvent.keyDown(window, {code: 'Space', key: ' '});

  expect(sendCommand).toHaveBeenCalledWith('stop_recording', expect.stringContaining('"clipId"'));
});

test('voice track recording dispatches the native audio capture command', () => {
  render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));

  const startCaptureCall = sendCommand.mock.calls.find(([command]) => command === 'start_audio_recording');
  expect(startCaptureCall).toBeTruthy();
  expect(startCaptureCall?.[1]).toContain('"startBeat":0');
});

test('voice track recording stop pauses native transport at the take end', async () => {
  sendCommand.mockImplementation((command: string) => {
    if (command === 'engine_status' || command === 'engine_status_fast') {
      return JSON.stringify({
        ok: true,
        data: {deviceName: 'Mock Output', sampleRate: 48000},
      });
    }
    if (command === 'stop_audio_recording') {
      return JSON.stringify({
        ok: true,
        data: {
          audioFilePath: 'recordings/take.wav',
          absoluteAudioFilePath: '/tmp/take.wav',
          lengthBeats: 3,
          durationSeconds: 1.5,
          waveformPeaks: [0.2, 0.4],
        },
      });
    }
    return JSON.stringify({ok: true, data: {}});
  });

  render(<App />);

  fireEvent.click(screen.getByText('+ Add track'));
  fireEvent.click(screen.getByRole('button', {name: 'Voice / Audio'}));
  fireEvent.click(screen.getByRole('button', {name: 'R'}));
  fireEvent.click(screen.getByRole('button', {name: 'Start recording'}));
  fireEvent.click(await screen.findByRole('button', {name: 'Stop recording'}));

  const pauseCalls = sendCommand.mock.calls.filter(
    ([command, payload]) => command === 'transport_play' && typeof payload === 'string' && payload.includes('"isPlaying":false'),
  );

  expect(pauseCalls.at(-1)?.[1]).toContain('"positionSeconds":1.5');
});

test('timeline playhead drags and syncs native transport on release', () => {
  const {container} = render(<App />);
  const surface = container.querySelector('.timeline-surface') as HTMLDivElement;
  const scrubber = screen.getByTestId('playhead-scrubber');

  surface.getBoundingClientRect = () => ({
    left: 100,
    top: 0,
    right: 100 + 64 * PIXELS_PER_BEAT,
    bottom: 124,
    width: 64 * PIXELS_PER_BEAT,
    height: 124,
    x: 100,
    y: 0,
    toJSON: () => ({}),
  });
  scrubber.setPointerCapture = jest.fn();
  scrubber.releasePointerCapture = jest.fn();
  sendCommand.mockClear();

  fireEvent.pointerDown(scrubber, {button: 0, pointerId: 1, clientX: 100});
  fireEvent.pointerMove(scrubber, {pointerId: 1, clientX: 100 + 3 * PIXELS_PER_BEAT});

  expect(useDAWStore.getState().playheadBeat).toBe(3);
  expect(sendCommand).not.toHaveBeenCalledWith('transport_play', expect.any(String));

  fireEvent.pointerUp(scrubber, {pointerId: 1, clientX: 100 + 4 * PIXELS_PER_BEAT});

  expect(useDAWStore.getState().playheadBeat).toBe(4);
  expect(sendCommand).toHaveBeenCalledWith('transport_play', JSON.stringify({isPlaying: false, positionBeat: 4, positionSeconds: 2}));
});

test('drum lane icon paths work from packaged file URLs', () => {
  Object.values(DRUM_LANE_ICONS).forEach(iconPath => {
    expect(iconPath).toMatch(/^drums\/icons\//);
  });
});
